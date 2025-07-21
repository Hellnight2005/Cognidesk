module.exports = function formatPrompt({ contextChunks = [], question }) {
  // Map each chunk to a formatted string that includes the source file name
  const context = contextChunks
    .map(({ text, file_name }) => `From file: ${file_name}\n${text}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content: `
You are a helpful assistant.

Your task:
- Answer ONLY using the context provided below.
- If a question references a specific file or topic, prioritize information from that file.
- Do NOT say things like "in chunk 1" or "the text says" — just answer naturally.
- If the user asks for a "brief" or "detailed" reply, follow that style.
- If the answer is not in the context, respond with: "The answer is not available in the provided content."
- Do not use outside knowledge or guess.
    `.trim(),
    },
    {
      role: "user",
      content: `Context:\n\n${context}\n\n---\n\nQuestion: ${question}\n\nAnswer:`,
    },
  ];
};
