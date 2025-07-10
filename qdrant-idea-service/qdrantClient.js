// qdrantClient.js
const { QdrantClient } = require("@qdrant/js-client-rest");

const client = new QdrantClient({ url: "http://localhost:6333" });

async function createCollection() {
  const collectionName = "ideas";
  const exists = await client.getCollections();
  const found = exists.collections.find((col) => col.name === collectionName);
  if (!found) {
    await client.createCollection(collectionName, {
      vectors: { size: 768, distance: "Cosine" },
    });
    console.log(`✅ Created collection: ${collectionName}`);
  }
}

async function addIdea(id, embedding, content) {
  await client.upsert("ideas", {
    points: [
      {
        id,
        vector: embedding,
        payload: { content },
      },
    ],
  });
  console.log(`✅ Idea ${id} stored in Qdrant`);
}

async function searchIdeas(embedding) {
  const result = await client.search("ideas", {
    vector: embedding,
    limit: 3,
  });

  return result;
}

module.exports = { createCollection, addIdea, searchIdeas };
