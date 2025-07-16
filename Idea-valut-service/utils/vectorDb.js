const { QdrantClient } = require("@qdrant/js-client-rest");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");

const COLLECTION_NAME = "idea-valut";
const VECTOR_DIMENSION = 768;
const QDRANT_URL = "http://localhost:6333";

const client = new QdrantClient({ url: QDRANT_URL });

async function ensureCollection() {
  try {
    const res = await axios.get(`${QDRANT_URL}/collections/${COLLECTION_NAME}`);
    if (res.data?.result?.status === "green") {
      console.log(`✅ Collection already exists: ${COLLECTION_NAME}`);
      return;
    }
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error(
        "❌ Failed to check collection:",
        err.response?.data || err.message
      );
      throw err;
    }
  }

  try {
    const payload = {
      vectors: {
        size: VECTOR_DIMENSION,
        distance: "Cosine",
      },
      hnsw_config: {
        full_scan_threshold: 10,
      },
      optimizer_config: {
        indexing_threshold: 100,
      },
    };

    await axios.put(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, payload, {
      headers: { "Content-Type": "application/json" },
    });

    console.log(`✅ Created collection: ${COLLECTION_NAME}`);
  } catch (err) {
    console.error("❌ Failed to create collection (axios):");
    console.error("Status:", err.response?.status);
    console.error("Data:", JSON.stringify(err.response?.data, null, 2));
    throw err;
  }
}

async function saveToQdrant({
  idea_id = null,
  user_id = null,
  file_name = "",
  vector,
  original_text = "",
  metadata = {},
}) {
  const id = uuidv4();

  const payload = {
    idea_id,
    user_id,
    file_name,
    original_text,
    ...metadata,
  };

  try {
    await client.upsert(COLLECTION_NAME, {
      points: [
        {
          id,
          vector,
          payload,
        },
      ],
    });

    console.log(
      `💾 Vector saved: ID=${id} | File=${file_name} | Chunk=${metadata.chunk_index}`
    );
  } catch (err) {
    console.error("❌ Failed to upsert vector:", err.message);
    throw err;
  }
}

async function searchFromQdrant(vector, limit = 300) {
  try {
    const result = await client.search(COLLECTION_NAME, {
      vector,
      limit,
      with_payload: true,
    });

    console.log(`🔍 Found ${result.length} similar result(s)`);
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
