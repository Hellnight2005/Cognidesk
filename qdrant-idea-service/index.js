// index.js
const { getEmbedding } = require("./ollamaClient");
const { createCollection, addIdea, searchIdeas } = require("./qdrantClient");

async function main() {
  await createCollection();

  const ideaText = "Build an AI agent that helps organize meetings";
  const ideaId = "6f9b3512-3ad9-11ee-be56-0242ac120002";

  const embedding = await getEmbedding(ideaText);
  await addIdea(ideaId, embedding, ideaText);

  console.log("🔍 Searching for similar ideas...");
  const results = await searchIdeas(embedding);

  console.log("🔎 Top Matches:", results);
}

main();
