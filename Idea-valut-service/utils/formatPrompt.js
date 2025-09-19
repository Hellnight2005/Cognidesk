module.exports = function formatPrompt({ contextChunks = [], question }) {
  // Convert context into bullet points with metadata
  const context = contextChunks
    .map(({ text, file_name, metadata = {} }) => {
      const parts = [
        `- File: ${file_name}`,
        metadata.chunk_index !== undefined
          ? `- Chunk: ${metadata.chunk_index}`
          : null,
        metadata.arxiv_id ? `- ArXiv ID: ${metadata.arxiv_id}` : null,
        metadata.year ? `- Year: ${metadata.year}` : null,
        `- Content: ${text}`,
      ].filter(Boolean); // remove nulls

      return parts.join("\n");
    })
    .join("\n\n---\n\n");

  return [
    {
      role: "system",
      content: `
You are a highly precise and helpful assistant.

Guidelines:
- Present the provided context in clear bullet points.
- Always base your answer strictly on the given context.
- Do NOT summarize unless explicitly asked to summarize.
- If the question is broad or asks for explanation, provide a detailed and elaborate answer.
- If the question is simple (like a date, code, or author), give a concise exact answer.

- If the answer is not in the context, reply exactly: "The answer is not available in the provided content."
      `.trim(),
    },
    {
      role: "user",
      content: `Context:\n\n${context}\n\n---\n\nQuestion: ${question}\n\nAnswer:`,
    },
  ];
};
