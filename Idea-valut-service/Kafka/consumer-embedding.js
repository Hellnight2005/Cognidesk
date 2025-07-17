const fs = require("fs");
const path = require("path");
const { Kafka } = require("kafkajs");
const mongoose = require("mongoose");
const sharedModels = require("../../shared-models");

const { extractTextFromPath } = require("../utils/extractText");
const { extractTextWithPdfParse } = require("../utils/extractPDF");
const { getTranscriptFromRapidAPI } = require("../utils/youtubeUtils");
const { scrapeWebsite } = require("../utils/webScraper");
const generateEmbedding = require("../utils/embedding");
const saveToQdrant = require("../utils/vectorDb");

const Idea =
  mongoose.models.Idea || mongoose.model("Idea", sharedModels.IdeaSchema);

const kafka = new Kafka({ clientId: "embedder", brokers: ["localhost:9092"] });
const consumer = kafka.consumer({ groupId: "embed-group" });

const EMBEDDING_DIR = path.resolve("public/embeddings");
const CONVERTED_DIR = path.resolve("public/converted");

if (!fs.existsSync(EMBEDDING_DIR))
  fs.mkdirSync(EMBEDDING_DIR, { recursive: true });
if (!fs.existsSync(CONVERTED_DIR))
  fs.mkdirSync(CONVERTED_DIR, { recursive: true });

const processFile = async (file, idea_id, user_id, retry = 0) => {
  try {
    let text = "";
    let filePath = "";

    if (file.youtube_link) {
      console.log(`🎥 Getting transcript for: ${file.youtube_link}`);
      text = await getTranscriptFromRapidAPI(file.youtube_link);
    } else if (file.website_url) {
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

    const embedding = await generateEmbedding(text);
    if (!embedding) throw new Error("Embedding generation failed");

    await saveToQdrant({
      idea_id,
      user_id,
      file_name: file.file_name,
      vector: embedding,
      metadata: {
        idea_id,
        user_id,
        file_name: file.file_name,
        original_name: file.originalname,
        drive_link: file.drive_file_link || null,
      },
    });

    console.log(`✅ Embedded: ${file.originalname}`);

    await Idea.updateOne(
      { _id: idea_id, "attached_files.file_name": file.file_name },
      { $set: { "attached_files.$.embedding_status": "completed" } }
    );

    if (filePath && fs.existsSync(filePath)) {
      const isAlreadyConverted =
        filePath.includes(CONVERTED_DIR) || filePath.includes(EMBEDDING_DIR);
      if (!isAlreadyConverted) {
        const targetPath = path.join(EMBEDDING_DIR, file.file_name);
        fs.renameSync(filePath, targetPath);
        console.log(`📁 Moved to embeddings: ${targetPath}`);
      }
      if (!filePath.includes(CONVERTED_DIR)) {
        fs.unlinkSync(file.path);
        console.log(`🗑️ Deleted uploaded file: ${file.path}`);
      }
    }
  } catch (err) {
    console.error(`❌ Error processing ${file.originalname}:`, err.message);

    await Idea.updateOne(
      { _id: idea_id, "attached_files.file_name": file.file_name },
      { $set: { "attached_files.$.embedding_status": "failed" } }
    );

    if (retry < 3) {
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
      if (ref.youtube_link) {
        console.log(`🎥 Getting transcript for: ${ref.youtube_link}`);
        text = await getTranscriptFromRapidAPI(ref.youtube_link);
      } else if (ref.website_url) {
        console.log(`🌐 Scraping website: ${ref.website_url}`);
        text = await scrapeWebsite(ref.website_url);
      }

      if (text) {
        externalTextResults.push({
          text,
          originalname: ref.title || ref.youtube_link || ref.website_url,
          sourceType: ref.youtube_link ? "youtube" : "website",
        });
      }
    } catch (err) {
      console.error(
        `❌ Failed to process external ref: ${
          ref.youtube_link || ref.website_url
        }`,
        err.message
      );
    }
  }

  for (const item of externalTextResults) {
    try {
      const embedding = await generateEmbedding(item.text);
      await saveToQdrant({
        idea_id,
        user_id,
        file_name: item.originalname,
        vector: embedding,
        metadata: {
          idea_id,
          user_id,
          source_type: item.sourceType,
          original_name: item.originalname,
        },
      });
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
  await consumer.subscribe({
    topic: "idea-file-process",
    fromBeginning: false,
  });

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
