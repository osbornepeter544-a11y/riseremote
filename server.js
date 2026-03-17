const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// Serve static files from public folder
app.use(express.static(path.join(__dirname, "public")));

// API route to fetch real remote jobs with flexible filtering
app.get("/api/jobs", async (req, res) => {
    try {
        const categoryQuery = req.query.category;
        const limitQuery = parseInt(req.query.limit);

        const DEFAULT_LIMIT = 50;
        const MAX_LIMIT = 100;

        const limit = (!isNaN(limitQuery) && limitQuery > 0)
            ? Math.min(limitQuery, MAX_LIMIT)
            : DEFAULT_LIMIT;

        const response = await axios.get("https://remotive.com/api/remote-jobs");
        let jobs = response.data.jobs;

        // Optional category filtering (exact match)
        if (categoryQuery) {
            jobs = jobs.filter(job =>
                job.category.toLowerCase().includes(categoryQuery.toLowerCase())
            );
        }

        // Apply limit
        jobs = jobs.slice(0, limit).map(job => ({
            id: job.id,
            title: job.title,
            company: job.company_name,
            category: job.category,
            url: job.url
        }));

        res.json(jobs);

    } catch (error) {
        res.status(500).json({ error: "Failed to fetch jobs" });
    }
});

// Fallback route (serve index.html)
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
