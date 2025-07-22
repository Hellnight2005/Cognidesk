const { QdrantClient } = require("@qdrant/js-client-rest");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const log = require("../utils/logger"); // Adjust path to your logger

const COLLECTION_NAME = "idea-valut";
const VECTOR_DIMENSION = 768;
const QDRANT_URL = "http://localhost:6333";

const client = new QdrantClient({ url: QDRANT_URL });

async function ensureCollection() {
  try {
    const res = await axios.get(`${QDRANT_URL}/collections/${COLLECTION_NAME}`);
    if (res.data?.result?.status === "green") {
      log.info(`Collection already exists: ${COLLECTION_NAME}`);
      return;
    }
  } catch (err) {
    if (err.response?.status !== 404) {
      log.error(
        "Failed to check collection:",
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

    log.info(`Created collection: ${COLLECTION_NAME}`);
  } catch (err) {
    log.error("Failed to create collection", {
      status: err.response?.status,
      data: err.response?.data,
    });
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

    log.info("Vector saved", { id, file_name, chunk: metadata.chunk_index });
  } catch (err) {
    log.error("Failed to upsert vector", { message: err.message });
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

    log.info("Search result", { matches: result.length });
    return result;
  } catch (err) {
    log.error("Qdrant search failed", { message: err.message });
    throw err;
  }
}

async function deleteVectorsByFileName(file_name) {
  try {
    await client.delete(COLLECTION_NAME, {
      filter: {
        must: [
          {
            key: "file_name",
            match: {
              value: file_name,
            },
          },
        ],
      },
    });

    log.info("Vectors deleted for file", { file_name });
  } catch (err) {
    log.error("Failed to delete vectors", { file_name, error: err.message });
    throw err;
  }
}

module.exports = {
  ensureCollection,
  saveToQdrant,
  searchFromQdrant,
  deleteVectorsByFileName,
};
