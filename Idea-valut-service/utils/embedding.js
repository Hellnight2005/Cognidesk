const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { ensureCollection, saveToQdrant } = require("./vectorDb");

const CONVERTED_DIR = path.resolve("public/converted");
const EMBEDDING_DIR = path.resolve("public/embeddings");
const QDRANT_URL = "http://localhost:6333";

if (!fs.existsSync(EMBEDDING_DIR)) {
  fs.mkdirSync(EMBEDDING_DIR, { recursive: true });
}

function cleanText(rawText) {
  return rawText
    .replace(/-\n/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/Figure\s\d+[^.]*\./gi, "")
    .replace(/[A-Z]{1,2}\s(?=\n)/g, "")
    .trim();
}

function chunkText(text, maxTokens = 300) {
  const sentences = text.split(/(?<=[.?!])\s+/);
  const chunks = [];
  let chunk = "";

  for (const sentence of sentences) {
    if ((chunk + sentence).split(" ").length < maxTokens) {
      chunk += sentence + " ";
    } else {
      if (chunk) chunks.push(chunk.trim());
      chunk = sentence + " ";
    }
  }
  if (chunk) chunks.push(chunk.trim());
  return chunks;
}

function extractMetadata(text) {
  const arxivMatch = text.match(/arXiv:(\d{4}\.\d{5})/i);
  const yearMatch = text.match(/\b(19|20)\d{2}\b/g);
  const authorMatch = text.match(/^[\[\d\]]?[\s\S]{0,300}?\.?arXiv|\d{4}/im);

  const arxiv_id = arxivMatch?.[1] || null;
  const year = yearMatch ? Math.max(...yearMatch.map(Number)) : null;

  return {
    arxiv_id,
    year,
    authors_raw: authorMatch?.[0]?.trim() || null,
  };
}

async function generateEmbedding(text, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.post("http://localhost:11434/api/embeddings", {
        model: "nomic-embed-text",
        prompt: text,
      });

      const vector = res.data.embedding;
      if (!Array.isArray(vector) || vector.length !== 768) {
        throw new Error(`Invalid vector size: ${vector?.length}`);
      }

      return vector;
    } catch (err) {
      if (attempt === retries) {
        console.error(
          "❌ Embedding failed:",
          err.response?.data || err.message
        );
        return null;
      }
      await new Promise((res) => setTimeout(res, 1000 * attempt));
    }
  }
}

async function embedTextFileAndSave(fullFilePath, user_id, idea_id) {
  const fileName = path.basename(fullFilePath);
  console.log(`\n🚀 Starting embedding for: ${fileName}`);

  await ensureCollection();

  if (!fs.existsSync(fullFilePath)) {
    console.error(`❌ File not found: ${fileName}`);
    return;
  }

  const targetPath = path.join(EMBEDDING_DIR, fileName);
  if (fs.existsSync(targetPath)) {
    console.warn(`⏭️ Skipped (already embedded): ${fileName}`);
    return;
  }

  const rawText = fs.readFileSync(fullFilePath, "utf-8");
  if (!rawText || rawText.trim().length < 10) {
    console.warn(`⚠️ File is too short or empty: ${fileName}`);
    return;
  }

  const cleanedText = cleanText(rawText);
  const chunks = chunkText(cleanedText);
  const metadata = extractMetadata(cleanedText);

  console.log(`🧠 Embedding ${chunks.length} text chunks...`);

  let successCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    const vector = await generateEmbedding(chunks[i]);
    if (!vector) continue;

    try {
      await saveToQdrant({
        idea_id,
        user_id,
        file_name: fileName,
        vector,
        original_text: chunks[i],
        metadata: {
          chunk_index: i,
          source: "converted-file",
          ...metadata,
        },
      });
      successCount++;
    } catch (_) {
      // Silent fail for individual chunk
    }
  }

  try {
    await axios.patch(
      `${QDRANT_URL}/collections/idea-valut`,
      { optimizer_config: { indexing_threshold: 1 } },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (_) {
    // Silent fail for optimizer config
  }

  console.log(
    `✅ Embedded and saved ${successCount}/${chunks.length} chunks for: ${fileName}`
  );

  fs.unlinkSync(fullFilePath);
  console.log(`🗑️ Removed source file: ${fileName}\n`);
}

module.exports = embedTextFileAndSave;
