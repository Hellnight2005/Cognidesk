module.exports = function formatPrompt({ contextChunks = [], question }) {
  // Prioritize chunks by relevance (if available) and include metadata for specificity
  const context = contextChunks
    .map(({ text, file_name, metadata = {} }, index) => {
      const parts = [
        `File: ${file_name}`,
        metadata.chunk_index !== undefined
          ? `Chunk: ${metadata.chunk_index}`
          : null,
        metadata.arxiv_id ? `ArXiv ID: ${metadata.arxiv_id}` : null,
        metadata.year ? `Year: ${metadata.year}` : null,
        text,
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
- Answer ONLY using the context provided below.
- Use metadata (file name, year, chunk index) to pinpoint exact information.
- Extract exact values when asked (like course code, date, author, syllabus details).
- If a question asks for something specific in a file, prioritize info from that file.
- If the answer is not in the context, reply exactly: "The answer is not available in the provided content."
- Answer concisely and avoid generic filler.
      `.trim(),
    },
    {
      role: "user",
      content: `Context:\n\n${context}\n\n---\n\nQuestion: ${question}\n\nAnswer:`,
    },
  ];
};
