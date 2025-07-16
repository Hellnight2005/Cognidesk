const { QdrantClient } = require("@qdrant/js-client-rest");
const { v4: uuidv4 } = require("uuid");

const QDRANT_URL = "http://localhost:6333";
const COLLECTION_NAME = "ideas";
const VECTOR_DIMENSION = 768; // Update if your embedding model uses a different size
const DISTANCE_METRIC = "Cosine";

const client = new QdrantClient({ url: QDRANT_URL });

/**
 * Ensure Qdrant collection exists, or create it with proper vector configuration.
 */
async function ensureCollection() {
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === COLLECTION_NAME
    );

    if (!exists) {
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: VECTOR_DIMENSION,
          distance: DISTANCE_METRIC,
        },
      });
      console.log(`✅ Created collection: ${COLLECTION_NAME}`);
    } else {
      console.log(`✅ Collection already exists: ${COLLECTION_NAME}`);
    }
  } catch (err) {
    console.error("❌ Failed to check/create collection:", err.message);
    throw err;
  }
}

/**
 * Save a vector + payload (text, metadata) to Qdrant
 */
async function saveToQdrant({
  idea_id = null,
  user_id = null,
  file_name = "",
  vector,
  original_text = "",
  metadata = {},
}) {
  if (!vector || !Array.isArray(vector)) {
    throw new Error("Invalid vector input: must be an array.");
  }

  const id = uuidv4();

  try {
    await client.upsert(COLLECTION_NAME, {
      points: [
        {
          id,
          vector,
          payload: {
            idea_id,
            user_id,
            file_name,
            original_text,
            ...metadata,
          },
        },
      ],
    });
    console.log(`✅ Vector saved with ID: ${id}`);
  } catch (err) {
    console.error("❌ Failed to save vector:", err.message);
    throw err;
  }
}

/**
 * Search Qdrant for similar vectors
 */
async function searchFromQdrant(vector, limit = 5) {
  if (!vector || !Array.isArray(vector)) {
    throw new Error("Invalid query vector");
  }

  try {
    const result = await client.search(COLLECTION_NAME, {
      vector,
      limit,
      with_payload: true, // So we get the text + metadata back
    });

    return result;
  } catch (err) {
    console.error("❌ Qdrant search failed:", err.message);
    throw err;
  }
}

module.exports = {
  ensureCollection,
  saveToQdrant,
  searchFromQdrant,
};
