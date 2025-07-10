// ollamaClient.js
const axios = require("axios");

async function getEmbedding(text) {
  const response = await axios.post("http://localhost:11434/api/embeddings", {
    model: "nomic-embed-text",
    prompt: text,
  });

  return response.data.embedding;
}

module.exports = { getEmbedding };
