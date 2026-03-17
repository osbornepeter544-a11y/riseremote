const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// Serve static files from public folder
app.use(express.static(path.join(__dirname, "public")));

// Entry-level keywords filter
const ENTRY_KEYWORDS = [
    "junior",
    "entry",
    "intern",
    "associate",
    "trainee"
];

// Category mapping
const CATEGORY_MAP = {
    tech: ["Software Development", "DevOps / Sysadmin", "Data", "AI / ML"],
    writing: ["Writing", "Content", "Copywriting"],
    marketing: ["Marketing", "SEO", "Growth"],
    support: ["Customer Support", "Sales / Business"]
};

// API route to fetch real remote jobs with filtering
app.get("/api/jobs", async (req, res) => {
    try {
        const categoryQuery = req.query.category?.toLowerCase();

        const response = await axios.get("https://remotive.com/api/remote-jobs");
        let jobs = response.data.jobs;

        // Filter by entry-level keywords
        jobs = jobs.filter(job => {
            const titleLower = job.title.toLowerCase();
            return ENTRY_KEYWORDS.some(keyword =>
                titleLower.includes(keyword)
            );
        });

        // Filter by category if provided
        if (categoryQuery && CATEGORY_MAP[categoryQuery]) {
            const allowedCategories = CATEGORY_MAP[categoryQuery];

            jobs = jobs.filter(job =>
                allowedCategories.some(cat =>
                    job.category.includes(cat)
                )
            );
        }

        // Limit results
        jobs = jobs.slice(0, 15).map(job => ({
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
