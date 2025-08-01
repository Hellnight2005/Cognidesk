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
    const vector = await generateTextEmbedding(userQuestion);
    if (!vector) throw new Error("Failed to generate embedding");

    let contextChunks = [];

    if (isSummaryRequest(userQuestion)) {
      const results = await searchFromQdrant(vector, 20);
      const threshold = 0.5;

      contextChunks = results
        .filter((r) => r.score >= threshold && r.payload.original_text)
        .map((r) => r.payload.original_text);
    } else {
      const results = await searchFromQdrant(vector, 5);

      contextChunks = results
        .filter((r) => r.payload.original_text)
        .map((r) => ({
          text: r.payload.original_text,
          file_name: r.payload.file_name || "unknown",
        }));
    }

    const fullPrompt = isSummaryRequest(userQuestion)
      ? formatSummaryPrompt(contextChunks)
      : formatPrompt({ contextChunks, question: userQuestion });

    const ollamaRes = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: "tinyllama",
        prompt: Array.isArray(fullPrompt)
          ? fullPrompt.map((m) => m.content).join("\n\n")
          : fullPrompt,
        stream: true,
      },
      { responseType: "stream" }
    );

    // Set up streaming response to client
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    ollamaRes.data.on("data", (chunk) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.response) {
            res.write(`data: ${parsed.response}\n\n`);
          }
        } catch (_) {}
      }
    });

    ollamaRes.data.on("end", () => {
      res.write("data: [END]\n\n");
      res.end();
    });

    ollamaRes.data.on("error", (err) => {
      console.error("Ollama stream error:", err);
      res.end();
    });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Failed to process message." });
  }
});

module.exports = router;
