const express = require("express");
const axios = require("axios");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 10000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initializeDatabase() {
    await pool.query(`
        DROP TABLE IF EXISTS jobs;
    `);

    await pool.query(`
        CREATE TABLE jobs (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            company TEXT NOT NULL,
            category TEXT,
            url TEXT UNIQUE NOT NULL,
            source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log("Jobs table recreated");
}

app.use(express.static(path.join(__dirname, "public")));

async function safeFetch(url, config = {}) {
    try {
        const response = await axios.get(url, config);
        return response.data;
    } catch (error) {
        console.log(`Failed to fetch: ${url}`);
        return null;
    }
}

async function fetchAndStoreJobs() {
    try {
        console.log("Starting job sync...");

        const remotiveData = await safeFetch("https://remotive.com/api/remote-jobs");

        const arbeitnowData = await safeFetch("https://www.arbeitnow.com/api/job-board-api");

        const remoteokData = await safeFetch("https://remoteok.com/api", {
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        const jobicyData = await safeFetch("https://jobicy.com/api/v2/remote-jobs");

        let combined = [];

        if (remotiveData?.jobs) {
            combined.push(...remotiveData.jobs.map(job => ({
                id: `remotive-${job.id}`,
                title: job.title,
                company: job.company_name,
                category: job.category,
                url: job.url,
                source: "remotive"
            })));
        }

        if (arbeitnowData?.data) {
            combined.push(...arbeitnowData.data.map(job => ({
                id: `arbeitnow-${job.slug}`,
                title: job.title,
                company: job.company_name,
                category: job.tags?.join(", ") || "General",
                url: job.url,
                source: "arbeitnow"
            })));
        }

        if (Array.isArray(remoteokData)) {
            combined.push(...remoteokData
                .filter(job => job.position)
                .map(job => ({
                    id: `remoteok-${job.id}`,
                    title: job.position,
                    company: job.company,
                    category: job.tags?.join(", ") || "Remote",
                    url: job.url,
                    source: "remoteok"
                }))
            );
        }

        if (jobicyData?.jobs) {
            combined.push(...jobicyData.jobs.map(job => ({
                id: `jobicy-${job.id}`,
                title: job.title,
                company: job.companyName,
                category: job.jobCategory || "Remote",
                url: job.url,
                source: "jobicy"
            })));
        }

        const seenUrls = new Set();
        const uniqueJobs = [];

        for (const job of combined) {
            if (!seenUrls.has(job.url)) {
                seenUrls.add(job.url);
                uniqueJobs.push(job);
            }
        }

        for (const job of uniqueJobs) {
            await pool.query(`
                INSERT INTO jobs (id, title, company, category, url, source)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (url) DO NOTHING;
            `, [job.id, job.title, job.company, job.category, job.url, job.source]);
        }

        console.log("Job sync completed");

    } catch (error) {
        console.error("Sync error:", error);
    }
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

app.get("/api/jobs", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 60;

        const offset = (page - 1) * limit;

        const totalResult = await pool.query(`SELECT COUNT(*) FROM jobs`);
        const total = parseInt(totalResult.rows[0].count);

        // Weighted distribution
        const jobicyLimit = Math.floor(limit * 0.4);
        const remoteokLimit = Math.floor(limit * 0.3);
        const remotiveLimit = Math.floor(limit * 0.2);
        const arbeitnowLimit = limit - (jobicyLimit + remoteokLimit + remotiveLimit);

        const jobicy = await pool.query(
            `SELECT * FROM jobs WHERE source = 'jobicy'
             ORDER BY RANDOM()
             LIMIT $1 OFFSET $2`,
            [jobicyLimit, offset]
        );

        const remoteok = await pool.query(
            `SELECT * FROM jobs WHERE source = 'remoteok'
             ORDER BY RANDOM()
             LIMIT $1 OFFSET $2`,
            [remoteokLimit, offset]
        );

        const remotive = await pool.query(
            `SELECT * FROM jobs WHERE source = 'remotive'
             ORDER BY RANDOM()
             LIMIT $1 OFFSET $2`,
            [remotiveLimit, offset]
        );

        const arbeitnow = await pool.query(
            `SELECT * FROM jobs WHERE source = 'arbeitnow'
             ORDER BY RANDOM()
             LIMIT $1 OFFSET $2`,
            [arbeitnowLimit, offset]
        );

        let combined = [
            ...jobicy.rows,
            ...remoteok.rows,
            ...remotive.rows,
            ...arbeitnow.rows
        ];

        combined = shuffle(combined);

        res.json({
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            data: combined
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to retrieve jobs" });
    }
});

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

initializeDatabase().then(async () => {
    await fetchAndStoreJobs();
    setInterval(fetchAndStoreJobs, 3 * 60 * 60 * 1000);
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});
