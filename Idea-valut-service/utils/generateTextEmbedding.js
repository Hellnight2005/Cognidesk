const axios = require("axios");

/**
 * Generate embedding for a user input (question or plain text).
 * @param {string} text - The text to embed.
 * @param {number} retries - Number of retry attempts.
 * @returns {Promise<number[] | null>} - The embedding vector or null.
 */
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

      console.log(`🔹 Text embedding generated: "${text.slice(0, 60)}..."`);
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
