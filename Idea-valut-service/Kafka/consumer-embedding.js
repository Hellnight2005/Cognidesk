const fs = require("fs");
const path = require("path");
const { Kafka } = require("kafkajs");
const mongoose = require("mongoose");
const sharedModels = require("../../shared-models");

const { extractTextFromPath } = require("../utils/extractText");
const { extractTextWithPdfParse } = require("../utils/extractPDF");
const { scrapeWebsite } = require("../utils/webScraper");
const embedTextFileAndSave = require("../utils/embedding");

const Idea =
  mongoose.models.Idea || mongoose.model("Idea", sharedModels.IdeaSchema);

const kafka = new Kafka({ clientId: "embedder", brokers: ["localhost:9092"] });
const consumer = kafka.consumer({ groupId: "idea-embedder-group" });

const EMBEDDING_DIR = path.resolve("public/embeddings");
const CONVERTED_DIR = path.resolve("public/converted");

if (!fs.existsSync(EMBEDDING_DIR))
  fs.mkdirSync(EMBEDDING_DIR, { recursive: true });
if (!fs.existsSync(CONVERTED_DIR))
  fs.mkdirSync(CONVERTED_DIR, { recursive: true });

function normalizeFileName(fileName) {
  return path
    .basename(fileName, path.extname(fileName))
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const processFile = async (file, idea_id, user_id, retry = 0) => {
  try {
    let text = "";
    let filePath = "";

    if (file.website_url) {
      console.log(`🌐 Scraping website: ${file.website_url}`);
      text = await scrapeWebsite(file.website_url);
    } else {
      filePath = path.resolve(file.path);
      if (!fs.existsSync(filePath)) {
        const fallbackPath = path.resolve(CONVERTED_DIR, file.file_name);
        if (fs.existsSync(fallbackPath)) {
          filePath = fallbackPath;
          console.log(`🔁 Fallback: ${file.file_name}`);
        } else {
          console.warn(`❌ File not found: ${filePath}`);
          throw new Error("File not found");
        }
      }

      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".pdf") text = await extractTextWithPdfParse(filePath);
      else if ([".docx", ".md", ".txt"].includes(ext))
        text = await extractTextFromPath(filePath);
      else throw new Error("Unsupported file type");
    }

    if (!text) throw new Error("No text extracted");

    const normalizedBase = normalizeFileName(file.file_name);
    const txtFileName = `${normalizedBase}.txt`;
    const txtFilePath = path.join(CONVERTED_DIR, txtFileName);

    if (!fs.existsSync(txtFilePath)) {
      console.warn(`❌ File not found in converted dir: ${txtFileName}`);
      throw new Error("Converted .txt file missing");
    }

    await embedTextFileAndSave(txtFilePath, user_id, idea_id);
    console.log(`✅ Embedded: ${file.originalname}`);

    await Idea.updateOne(
      { _id: idea_id, "attached_files.file_name": file.file_name },
      { $set: { "attached_files.$.embedding_status": "completed" } }
    );

    if (file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
      console.log(`🗑️ Deleted uploaded file: ${file.path}`);

      const convertedPath = path.join(
        CONVERTED_DIR,
        normalizeFileName(file.file_name) + ".txt"
      );
      if (fs.existsSync(convertedPath)) {
        fs.unlinkSync(convertedPath);
        console.log(`🗑️ Deleted converted file: ${convertedPath}`);
      }

      const embeddedPath = path.join(EMBEDDING_DIR, file.file_name);
      if (fs.existsSync(embeddedPath)) {
        fs.unlinkSync(embeddedPath);
        console.log(`🗑️ Deleted embedded file: ${embeddedPath}`);
      }
    }
  } catch (err) {
    console.error(`❌ Error processing ${file.originalname}:`, err.message);

    await Idea.updateOne(
      { _id: idea_id, "attached_files.file_name": file.file_name },
      { $set: { "attached_files.$.embedding_status": "failed" } }
    );

    if (retry < 2) {
      console.log(`🔁 Retrying ${file.originalname} (${retry + 1}/3)`);
      await processFile(file, idea_id, user_id, retry + 1);
    } else {
      console.warn(`🚫 Max retries reached for ${file.originalname}`);
    }
  }
};

const processExternalReferences = async (
  idea_id,
  user_id,
  external_references = []
) => {
  const externalTextResults = [];

  for (const ref of external_references) {
    try {
      let text = "";
      const url = ref.url?.trim();
      const label = ref.label?.toLowerCase();

      if (label === "website" && url.startsWith("http")) {
        console.log(`🌐 Scraping website: ${url}`);
        text = await scrapeWebsite(url);
      }

      if (text) {
        externalTextResults.push({
          text,
          originalname: ref.label || url,
          sourceType: "website",
        });
      }
    } catch (err) {
      console.error(
        `❌ Failed to process external ref: ${ref.url}`,
        err.message
      );
    }
  }

  for (const item of externalTextResults) {
    try {
      const normalizedFileName = normalizeFileName(item.originalname) + ".txt";
      const fakePath = path.join(CONVERTED_DIR, normalizedFileName);

      fs.writeFileSync(fakePath, item.text);
      await embedTextFileAndSave(fakePath, user_id, idea_id);

      console.log(`✅ Embedded external: ${item.originalname}`);
    } catch (err) {
      console.error(
        `❌ Embedding failed for external ref: ${item.originalname}`,
        err.message
      );
    }
  }
};

const startEmbeddingConsumer = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: "idea-file-process", fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const data = JSON.parse(message.value.toString());
      const {
        idea_id,
        user_id,
        files = [],
        external_references = [],
        event,
      } = data;

      if (event !== "IDEA_CREATED") return;

      console.log(`📥 Received idea ${idea_id} with ${files.length} files`);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(
          `📊 Progress: ${i + 1}/${files.length} - ${file.originalname}`
        );
        await processFile(file, idea_id, user_id);
      }

      await processExternalReferences(idea_id, user_id, external_references);

      await Idea.findByIdAndUpdate(idea_id, { embedding_status: "completed" });

      console.log(`🎉 Embedding complete for idea: ${idea_id}`);
    },
  });
};

module.exports = { startEmbeddingConsumer };
