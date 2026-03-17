const express = require("express");
const axios = require("axios");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 10000;

// PostgreSQL connection using Render's DATABASE_URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Initialize jobs table
async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                company TEXT NOT NULL,
                category TEXT,
                url TEXT NOT NULL,
                source TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Jobs table ready");
    } catch (error) {
        console.error("Database initialization error:", error);
    }
}

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Temporary: keep live aggregation working
app.get("/api/jobs", async (req, res) => {
    try {
        const limitQuery = parseInt(req.query.limit);
        const DEFAULT_LIMIT = 100;
        const MAX_LIMIT = 300;

        const limit = (!isNaN(limitQuery) && limitQuery > 0)
            ? Math.min(limitQuery, MAX_LIMIT)
            : DEFAULT_LIMIT;

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

        const combinedJobs = [...remotiveJobs, ...arbeitnowJobs];

        const seen = new Set();
        const uniqueJobs = [];

        for (const job of combinedJobs) {
            const key = job.title.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!seen.has(key)) {
                seen.add(key);
                uniqueJobs.push(job);
            }
        }

        res.json(uniqueJobs.slice(0, limit));

    } catch (error) {
        res.status(500).json({ error: "Failed to fetch jobs" });
    }
});

// Fallback
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server after DB initialization
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});
