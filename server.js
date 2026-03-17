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
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            company TEXT NOT NULL,
            category TEXT,
            url TEXT UNIQUE NOT NULL,
            source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log("Jobs table ready");
}

app.use(express.static(path.join(__dirname, "public")));

async function fetchAndStoreJobs() {
    try {
        console.log("Starting job sync...");

        const remotivePromise = axios.get("https://remotive.com/api/remote-jobs");
        const arbeitnowPromise = axios.get("https://www.arbeitnow.com/api/job-board-api");

        const [remotiveResponse, arbeitnowResponse] = await Promise.all([
            remotivePromise,
            arbeitnowPromise
        ]);

        const remotiveJobs = remotiveResponse.data.jobs.map(job => ({
            id: `remotive-${job.id}`,
            title: job.title,
            company: job.company_name,
            category: job.category,
            url: job.url,
            source: "remotive"
        }));

        const arbeitnowJobs = arbeitnowResponse.data.data.map(job => ({
            id: `arbeitnow-${job.slug}`,
            title: job.title,
            company: job.company_name,
            category: job.tags?.join(", ") || "General",
            url: job.url,
            source: "arbeitnow"
        }));

        const combined = [...remotiveJobs, ...arbeitnowJobs];

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

app.get("/api/jobs", async (req, res) => {
    try {
        const pageQuery = parseInt(req.query.page);
        const limitQuery = parseInt(req.query.limit);

        const DEFAULT_LIMIT = 50;
        const MAX_LIMIT = 200;

        const page = (!isNaN(pageQuery) && pageQuery > 0) ? pageQuery : 1;
        const limit = (!isNaN(limitQuery) && limitQuery > 0)
            ? Math.min(limitQuery, MAX_LIMIT)
            : DEFAULT_LIMIT;

        const offset = (page - 1) * limit;

        const totalResult = await pool.query(`SELECT COUNT(*) FROM jobs`);
        const total = parseInt(totalResult.rows[0].count);

        const result = await pool.query(
            `SELECT * FROM jobs
             ORDER BY created_at DESC
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
