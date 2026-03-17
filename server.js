const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// Serve static files from public folder
app.use(express.static(path.join(__dirname, "public")));

// API route to fetch real remote jobs
app.get("/api/jobs", async (req, res) => {
    try {
        const response = await axios.get("https://remotive.com/api/remote-jobs");
        
        const jobs = response.data.jobs.slice(0, 10).map(job => ({
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
