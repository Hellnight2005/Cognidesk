module.exports = function formatSummaryPrompt(chunks = []) {
  const context = chunks.map((c, i) => `Section ${i + 1}:\n${c}`).join("\n\n");

  return `
You are an expert assistant. Summarize the following content clearly and concisely.

${context}

Summary:
  `.trim();
};
