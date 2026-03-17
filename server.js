const express = require("express");
const axios = require("axios");
const path = require("path");
const { Pool } = require("pg");
const xml2js = require("xml2js");

const app = express();
const PORT = process.env.PORT || 10000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initializeDatabase() {
    await pool.query(`DROP TABLE IF EXISTS jobs;`);

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

    console.log("Jobs table ready (clean global version)");
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

async function fetchWeWorkRemotely() {
    try {
        const rssData = await safeFetch(
            "https://weworkremotely.com/categories/remote-programming-jobs.rss"
        );

        if (!rssData) return [];

        const parsed = await xml2js.parseStringPromise(rssData);
        const items = parsed?.rss?.channel?.[0]?.item || [];

        return items.map(item => ({
            id: `wwr-${item.guid?.[0] || item.link[0]}`,
            title: item.title[0],
            company: "WeWorkRemotely",
            category: "Remote Programming",
            url: item.link[0],
            source: "weworkremotely"
        }));
    } catch {
        return [];
    }
}

async function fetchAndStoreJobs() {
    try {
        console.log("Starting global sync...");

        const remotiveData = await safeFetch("https://remotive.com/api/remote-jobs");

        const remoteokData = await safeFetch("https://remoteok.com/api", {
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        const wwrJobs = await fetchWeWorkRemotely();

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

        combined.push(...wwrJobs);

        const seen = new Set();
        const unique = [];

        for (const job of combined) {
            if (!seen.has(job.url)) {
                seen.add(job.url);
                unique.push(job);
            }
        }

        for (const job of unique) {
            await pool.query(`
                INSERT INTO jobs (id, title, company, category, url, source)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (url) DO NOTHING;
            `, [job.id, job.title, job.company, job.category, job.url, job.source]);
        }

        console.log("Global job sync completed");

    } catch (error) {
        console.error("Sync error:", error);
    }
}

app.get("/api/jobs", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        const totalResult = await pool.query(`SELECT COUNT(*) FROM jobs`);
        const total = parseInt(totalResult.rows[0].count);

        const result = await pool.query(
            `SELECT * FROM jobs
             ORDER BY RANDOM()
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        res.json({
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            data: result.rows
        });

    } catch (error) {
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
