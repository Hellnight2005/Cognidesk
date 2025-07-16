module.exports = function formatPrompt({ contextChunks = [], question }) {
  const context = contextChunks
    .map((c, i) => `Chunk ${i + 1}:\n${c}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content: `
You are a helpful assistant. Answer strictly using the provided context.

- If the user asks for a "brief" or "detailed" answer, follow that.
- If the user does not specify, default to a short and concise answer.
- Do not guess or use any external knowledge.
      `.trim(),
    },
    {
      role: "user",
      content: `Context:\n${context}\n\nQuestion:\n${question}\n\nAnswer:`,
    },
  ];
};
