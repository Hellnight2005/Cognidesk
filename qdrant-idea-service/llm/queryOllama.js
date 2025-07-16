const axios = require("axios");

/**
 * Ask Ollama with the given question and context.
 */
async function askOllama({ question, context }) {
  try {
    const systemPrompt = `You are an expert assistant. Use the provided context below to answer the question accurately.`;
    const fullPrompt = `Context:\n${context}\n\nQuestion: ${question}`;

    const res = await axios.post("http://localhost:11434/api/generate", {
      model: "phi3", // or use "llama3", "mistral", etc.
      prompt: `${systemPrompt}\n\n${fullPrompt}`,
      stream: false,
    });

    return res.data.response;
  } catch (err) {
    console.error("❌ Ollama request failed:", err.message);
    throw err;
  }
}

module.exports = askOllama;
