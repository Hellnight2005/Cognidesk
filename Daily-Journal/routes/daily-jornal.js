const express = require("express");
const {
  saveDailyJournal,
  getMonthlyJournal,
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

module.exports = router;
