const axios = require("axios");

/**
 * Convert a question into a vector embedding using an external embedding model (e.g., Ollama or OpenAI).
 * You can replace this with your actual API call.
 */
async function generateQueryEmbedding(text) {
  try {
    const response = await axios.post("http://localhost:11434/api/embeddings", {
      model: "nomic-embed-text",
      prompt: text,
    });

    return response.data.embedding;
  } catch (err) {
    console.error("❌ Failed to generate embedding:", err.message);
    throw err;
  }
}

module.exports = generateQueryEmbedding;
