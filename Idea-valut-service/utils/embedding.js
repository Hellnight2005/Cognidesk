const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cliProgress = require("cli-progress");
const { ensureCollection, saveToQdrant } = require("./vectorDb");

const CONVERTED_DIR = path.resolve("public/converted");
const EMBEDDING_DIR = path.resolve("public/embeddings");
const QDRANT_URL = "http://localhost:6333";

if (!fs.existsSync(EMBEDDING_DIR)) {
  fs.mkdirSync(EMBEDDING_DIR, { recursive: true });
}

/**
 * Basic cleaning: remove figure refs, fix hyphenation, etc.
 */
function cleanText(rawText) {
  return rawText
    .replace(/-\n/g, "") // hyphenated line breaks
    .replace(/\n+/g, " ") // join lines
    .replace(/\s{2,}/g, " ") // extra spaces
    .replace(/Figure\s\d+[^.]*\./gi, "") // remove figure captions
    .replace(/[A-Z]{1,2}\s(?=\n)/g, "") // remove standalone letters (figure labels)
    .trim();
}

/**
 * Chunk plain text into logical blocks
 */
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

/**
 * Extract metadata (arXiv, year, authors)
 */
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

/**
 * Generate vector embedding for a single chunk
 */
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

      console.log(
        `🔹 Embedding generated for chunk (first 60 chars): "${text.slice(
          0,
          60
        )}..."`
      );
      return vector;
    } catch (err) {
      if (attempt === retries) {
        console.error("❌ Embedding failed:");
        console.error("➡️ Text:", text.slice(0, 200));
        console.error("➡️ Error:", err.response?.data || err.message);
        return null;
      }
      console.warn(`🔁 Retry ${attempt}/${retries} embedding...`);
      await new Promise((res) => setTimeout(res, 1000 * attempt));
    }
  }
}

/**
 * Embed a text file and save to Qdrant
 */
async function embedTextFileAndSave(fullFilePath) {
  const fileName = path.basename(fullFilePath);
  console.log(`\n🚀 Starting embedding process for: ${fileName}`);

  // Step 1: Ensure Qdrant collection exists
  console.log("📦 Ensuring Qdrant collection exists...");
  await ensureCollection();
  console.log("✅ Qdrant collection ready.");

  // Step 2: Validate input file
  if (!fs.existsSync(fullFilePath)) {
    console.error(`❌ File does not exist: ${fileName}`);
    return;
  }

  // Step 3: Check if already embedded
  const targetPath = path.join(EMBEDDING_DIR, fileName);
  if (fs.existsSync(targetPath)) {
    console.warn(`⏭️ Skipping ${fileName} (already embedded)`);
    return;
  }

  // Step 4: Read text content
  console.log(`📖 Reading file: ${fullFilePath}`);
  const rawText = fs.readFileSync(fullFilePath, "utf-8");
  if (!rawText || rawText.trim().length < 10) {
    console.warn(`⚠️ File is empty or too short: ${fileName}`);
    return;
  }

  // Step 5: Clean text
  console.log("🧹 Cleaning extracted text...");
  const cleanedText = cleanText(rawText);
  console.log("✅ Text cleaned.");

  // Step 6: Chunk text
  console.log("✂️ Chunking text into blocks...");
  const chunks = chunkText(cleanedText);
  console.log(`✅ ${chunks.length} chunks created.`);

  // Step 7: Extract metadata
  console.log("🔍 Extracting metadata...");
  const metadata = extractMetadata(cleanedText);
  console.log("🧾 Extracted Metadata:", metadata);

  // Step 8: Begin embedding process
  console.log("🧠 Starting embedding and saving to Qdrant...");
  const progress = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic
  );
  progress.start(chunks.length, 0);

  let successCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const vector = await generateEmbedding(chunk);
    if (!vector) {
      console.warn(`⚠️ Skipped chunk ${i} due to embedding error.`);
      continue;
    }

    try {
      await saveToQdrant({
        idea_id: null,
        user_id: null,
        file_name: fileName,
        vector,
        original_text: chunk,
        metadata: {
          chunk_index: i,
          source: "converted-file",
          ...metadata,
        },
      });
      console.log(`✅ Chunk ${i + 1}/${chunks.length} saved to Qdrant.`);
      successCount++;
    } catch (err) {
      console.error(`❌ Failed to save chunk ${i}:`, err.message);
    }

    progress.update(i + 1);
  }

  progress.stop();

  // Step 9: Trigger optimizer
  console.log("⚙️ Updating optimizer config in Qdrant...");
  try {
    await axios.patch(
      `${QDRANT_URL}/collections/idea-valut`,
      { optimizer_config: { indexing_threshold: 1 } },
      { headers: { "Content-Type": "application/json" } }
    );
    console.log("✅ Optimizer indexing threshold set to 1.");
  } catch (err) {
    console.error(
      "❌ Optimizer config failed:",
      err.response?.data || err.message
    );
  }

  // Step 10: Move processed file
  console.log(`📂 Moving ${fileName} to embeddings directory...`);
  fs.renameSync(fullFilePath, targetPath);
  console.log(`📁 Moved to: ${targetPath}`);

  // Final Summary
  console.log(`🎉 Completed embedding for ${fileName}`);
  console.log(`📌 Saved ${successCount}/${chunks.length} chunks to Qdrant.\n`);
}

module.exports = embedTextFileAndSave;
