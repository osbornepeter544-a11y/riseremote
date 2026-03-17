const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// Serve static files from public folder
app.use(express.static(path.join(__dirname, "public")));

// Utility function to normalize job title for deduplication
function normalizeTitle(title) {
    return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// API route to fetch jobs from multiple sources
app.get("/api/jobs", async (req, res) => {
    try {
        const limitQuery = parseInt(req.query.limit);
        const DEFAULT_LIMIT = 100;
        const MAX_LIMIT = 300;

        const limit = (!isNaN(limitQuery) && limitQuery > 0)
            ? Math.min(limitQuery, MAX_LIMIT)
            : DEFAULT_LIMIT;

        // Fetch from Remotive
        const remotivePromise = axios.get("https://remotive.com/api/remote-jobs");

        // Fetch from Arbeitnow
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
            url: job.url
        }));

        const arbeitnowJobs = arbeitnowResponse.data.data.map(job => ({
            id: `arbeitnow-${job.slug}`,
            title: job.title,
            company: job.company_name,
            category: job.tags?.join(", ") || "General",
            url: job.url
        }));

        // Merge jobs
        const combinedJobs = [...remotiveJobs, ...arbeitnowJobs];

        // Deduplicate by normalized title
        const seen = new Set();
        const uniqueJobs = [];

        for (const job of combinedJobs) {
            const normalized = normalizeTitle(job.title);
            if (!seen.has(normalized)) {
                seen.add(normalized);
                uniqueJobs.push(job);
            }
        }

        // Apply limit
        const finalJobs = uniqueJobs.slice(0, limit);

        res.json(finalJobs);

    } catch (error) {
        res.status(500).json({ error: "Failed to fetch jobs from sources" });
    }
});

// Fallback route
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
