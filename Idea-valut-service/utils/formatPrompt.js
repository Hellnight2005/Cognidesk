module.exports = function formatPrompt({ contextChunks = [], question }) {
  const context = contextChunks
    .map((c, i) => `Chunk ${i + 1}:\n${c}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content:
        "You are a helpful assistant. Only answer using the context provided.",
    },
    {
      role: "user",
      content: `Context:\n${context}\n\nQuestion:\n${question}\n\nAnswer:`,
    },
  ];
};
