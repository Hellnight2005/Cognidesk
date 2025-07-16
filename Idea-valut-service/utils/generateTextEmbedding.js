const axios = require("axios");

async function generateTextEmbedding(text, retries = 3) {
  if (!text || text.trim().length < 5) {
    console.error("❌ Text too short to embed.");
    return null;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(
        "http://localhost:11434/api/embeddings",
        {
          model: "nomic-embed-text",
          prompt: text,
        }
      );

      const vector = response.data?.embedding;
      if (!Array.isArray(vector) || vector.length !== 768) {
        throw new Error(`Invalid vector length: ${vector?.length}`);
      }

      console.log(`🔹 Text embedding generated.`);
      return vector;
    } catch (err) {
      console.warn(
        `🔁 Retry ${attempt}/${retries} - embedding failed: ${err.message}`
      );
      await new Promise((res) => setTimeout(res, 1000 * attempt));
    }
  }

  console.error("❌ All attempts to generate embedding failed.");
  return null;
}

module.exports = generateTextEmbedding;
