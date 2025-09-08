const express = require("express");
const {
  saveDailyJournal,
  getMonthlyJournal,
  analyzeMonthlyJournal,
  getTodayJournalEntries,
  getJournalByDate,
} = require("../controllers/controllers");
const router = express.Router();

router.post("/journal/save", async (req, res) => {
  const { userId, content } = req.body;
  try {
    const result = await saveDailyJournal(userId, content);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/monthly", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "userId is required." });
  }

  try {
    const entries = await getMonthlyJournal(userId);
    res.status(200).json({ entries });
  } catch (err) {
    console.error("Failed to fetch monthly journal:", err.message);
    res.status(500).json({ error: "Failed to fetch journal entries." });
  }
});

router.get("/MonthlyJournal", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "userId is required." });
  }
  try {
    const Journal = await analyzeMonthlyJournal(userId);
    res.status(200).json({ Journal });
  } catch (err) {
    console.error("Failed to analyze monthly journal:", err.message);
    res.status(500).json({ error: "Failed to analyze journal entries." });
  }
});

router.get("/todayEntries", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "userId is required." });
  }
  try {
    const entries = await getTodayJournalEntries(userId);
    res.status(200).json({ entries });
  } catch (err) {
    console.error("Failed to fetch today's journal entries:", err.message);
    res.status(500).json({ error: "Failed to fetch today's journal entries." });
  }
});

router.post("/journal/date", async (req, res) => {
  const { userId, date } = req.body;
  if (!userId || !date) {
    return res.status(400).json({ error: "userId and date are required." });
  }
  try {
    const entries = await getJournalByDate(userId, date);
    res.status(200).json({ entries });
  } catch (err) {
    console.error("Failed to fetch journal by date:", err.message);
    res.status(500).json({ error: "Failed to fetch journal entries by date." });
  }
});
module.exports = router;
