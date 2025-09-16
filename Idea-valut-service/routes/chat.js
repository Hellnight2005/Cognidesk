const express = require("express");
const router = express.Router();
const axios = require("axios");
const generateTextEmbedding = require("../utils/generateTextEmbedding");
const { searchFromQdrant } = require("../utils/vectorDb");
const formatPrompt = require("../utils/formatPrompt");
const formatSummaryPrompt = require("../utils/formatSummaryPrompt");

function isSummaryRequest(question) {
  const lowered = question.toLowerCase();
  return (
    lowered.includes("summarize") ||
    lowered.includes("summary") ||
    lowered.includes("give me a summary") ||
    lowered.startsWith("summary of")
  );
}

router.post("/chat", async (req, res) => {
  const userQuestion = req.body.message;

  if (!userQuestion) {
    return res.status(400).json({ error: "Message is required." });
  }

  try {
    // Generate embedding
    const vector = await generateTextEmbedding(userQuestion);
    if (!vector) throw new Error("Failed to generate embedding");

    let contextChunks = [];
    let sourceFiles = [];

    if (isSummaryRequest(userQuestion)) {
      const results = await searchFromQdrant(vector, 20);
      const threshold = 0.5;

      contextChunks = results
        .filter((r) => r.score >= threshold && r.payload.original_text)
        .map((r) => r.payload.original_text);

      sourceFiles = results
        .filter((r) => r.payload.file_name)
        .map((r) => r.payload.file_name);
    } else {
      const results = await searchFromQdrant(vector, 5);

      contextChunks = results
        .filter((r) => r.payload.original_text)
        .map((r) => ({
          text: r.payload.original_text,
          file_name: r.payload.file_name || "unknown",
        }));

      sourceFiles = results
        .filter((r) => r.payload.file_name)
        .map((r) => r.payload.file_name);
    }

    const fullPrompt = isSummaryRequest(userQuestion)
      ? formatSummaryPrompt(contextChunks)
      : formatPrompt({ contextChunks, question: userQuestion });

    // Call Ollama API without streaming
    const ollamaRes = await axios.post("http://localhost:11434/api/generate", {
      model: "tinyllama",
      prompt: Array.isArray(fullPrompt)
        ? fullPrompt.map((m) => m.content).join("\n\n")
        : fullPrompt,
      stream: false,
    });

    const botText = ollamaRes.data?.response || "";
    const uniqueSources = [...new Set(sourceFiles)];
    const totalMatches = contextChunks.length;

    // Send all info in one response
    res.json({
      text: botText,
      sources: uniqueSources,
      totalMatches,
    });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Failed to process message." });
  }
});

module.exports = router;
