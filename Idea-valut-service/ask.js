const readline = require("readline");
const axios = require("axios");
const generateTextEmbedding = require("./utils/generateTextEmbedding");
const { searchFromQdrant } = require("./utils/vectorDb");
const formatPrompt = require("./utils/formatPrompt");
const formatSummaryPrompt = require("./utils/formatSummaryPrompt");

function isSummaryRequest(question) {
  const lowered = question.toLowerCase();
  return (
    lowered.includes("summarize") ||
    lowered.includes("summary") ||
    lowered.includes("give me a summary") ||
    lowered.startsWith("summary of")
  );
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("🤖 Ask your question: ", async (userQuestion) => {
  rl.close();
  console.time("⏱️ Total time");

  try {
    console.log("🔎 Generating embedding for user question...");
    const vector = await generateTextEmbedding(userQuestion);
    if (!vector) throw new Error("Failed to generate query embedding.");

    let contextChunks = [];

    if (isSummaryRequest(userQuestion)) {
      console.log("🧠 Detected summary request. Searching wide...");
      const results = await searchFromQdrant(vector, 20);
      const threshold = 0.66;

      contextChunks = results
        .filter((r) => r.score >= threshold && r.payload.original_text)
        .map((r) => r.payload.original_text);

      console.log(`📚 Found ${contextChunks.length} chunks for summary.`);
    } else {
      console.log("🧠 Detected normal Q&A. Fetching top 5 chunks...");
      const results = await searchFromQdrant(vector, 5);

      contextChunks = results
        .map((r) => r.payload.original_text)
        .filter(Boolean);

      console.log(`📚 Found ${contextChunks.length} chunks for Q&A.`);
    }

    const fullPrompt = isSummaryRequest(userQuestion)
      ? formatSummaryPrompt(contextChunks)
      : formatPrompt({ contextChunks, question: userQuestion });

    console.log("🚀 Asking LLM via Ollama (streaming)...");
    const response = await axios.post(
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

    let buffer = "";
    let count = 0;
    response.data.on("data", (chunk) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.response) {
            buffer += parsed.response;
            count++;
            if (count >= 5) {
              process.stdout.write(buffer);
              buffer = "";
              count = 0;
            }
          }
        } catch (_) {}
      }
    });

    response.data.on("end", () => {
      if (buffer) process.stdout.write(buffer);
      console.log("\n");
      console.timeEnd("⏱️ Total time");
    });
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.timeEnd("⏱️ Total time");
  }
});
