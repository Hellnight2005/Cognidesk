module.exports = function formatSummaryPrompt(chunks = []) {
  // Assume chunks are objects { text, file_name } or strings
  const context = chunks
    .map((c, i) =>
      typeof c === "string"
        ? `Section ${i + 1}:\n${c}`
        : `Section ${i + 1} (from file: ${c.file_name}):\n${c.text}`
    )
    .join("\n\n");

  return `
You are an expert assistant. Summarize the following content clearly and concisely.

${context}

Summary:
  `.trim();
};
