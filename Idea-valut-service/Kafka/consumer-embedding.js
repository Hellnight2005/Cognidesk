const fs = require("fs");
const path = require("path");
const { Kafka } = require("kafkajs");
const mongoose = require("mongoose");

const sharedModels = require("../../shared-models");
const { extractTextFromFolder } = require("../utils/extractText");
const { extractTextWithPdfParse } = require("../utils/extractPDF");
const { getTranscriptFromRapidAPI } = require("../utils/youtubeUtils");
const { scrapeWebsite } = require("../utils/webScraper");

const generateEmbedding = require("../utils/embedding");
const saveToQdrant = require("../utils/vectorDb");

const Idea =
  mongoose.models.Idea || mongoose.model("Idea", sharedModels.IdeaSchema);

const kafka = new Kafka({
  clientId: "embedder",
  brokers: ["localhost:9092"],
});
const consumer = kafka.consumer({ groupId: "embed-group" });

const EMBEDDING_DIR = path.resolve("public/embeddings");
const CONVERTED_DIR = path.resolve("public/converted");

if (!fs.existsSync(EMBEDDING_DIR))
  fs.mkdirSync(EMBEDDING_DIR, { recursive: true });
if (!fs.existsSync(CONVERTED_DIR))
  fs.mkdirSync(CONVERTED_DIR, { recursive: true });

const startEmbeddingConsumer = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: "idea-topic", fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const data = JSON.parse(message.value.toString());
      const { idea_id, user_id, files, event } = data;

      if (event !== "IDEA_CREATED") return;

      for (const file of files) {
        try {
          let text = "";
          let filePath = "";

          // 🎥 YouTube link
          if (file.youtube_link) {
            console.log(`🎥 Getting transcript for: ${file.youtube_link}`);
            text = await getTranscriptFromRapidAPI(file.youtube_link);
          }

          // 🌐 Blog or webpage
          else if (file.website_url) {
            console.log(`🌐 Scraping website: ${file.website_url}`);
            text = await scrapeWebsite(file.website_url);
          }

          // 📄 Local file (PDF, DOCX, MD, TXT)
          else {
            filePath = path.resolve(file.path);

            if (!fs.existsSync(filePath)) {
              const fallbackPath = path.resolve(CONVERTED_DIR, file.file_name);
              if (fs.existsSync(fallbackPath)) {
                filePath = fallbackPath;
                console.log(`🔁 Fallback: ${file.file_name}`);
              } else {
                console.warn(`❌ File not found: ${filePath}`);
                continue;
              }
            }

            const ext = path.extname(filePath).toLowerCase();

            if (ext === ".pdf") {
              text = await extractTextWithPdfParse(filePath);
            } else if ([".docx", ".md", ".txt"].includes(ext)) {
              text = await extractTextFromFolder(filePath);
            } else {
              console.warn(`⚠️ Unsupported file type: ${file.originalname}`);
              continue;
            }
          }

          if (!text) {
            console.warn(`⚠️ No text extracted from ${file.originalname}`);
            continue;
          }

          const embedding = await generateEmbedding(text);
          if (!embedding) {
            console.warn(
              `⚠️ Failed to generate embedding for ${file.originalname}`
            );
            continue;
          }

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

          // Move + delete only if it's a local file
          if (filePath && fs.existsSync(filePath)) {
            const isAlreadyConverted =
              filePath.includes(CONVERTED_DIR) ||
              filePath.includes(EMBEDDING_DIR);

            // Rename to /embeddings if not already there
            if (!isAlreadyConverted) {
              const targetPath = path.join(EMBEDDING_DIR, file.file_name);
              fs.renameSync(filePath, targetPath);
              console.log(`📁 Moved to embeddings: ${targetPath}`);
            }

            // Delete uploaded version (from multer temp)
            if (!filePath.includes(CONVERTED_DIR)) {
              fs.unlinkSync(file.path); // remove original upload
              console.log(`🗑️ Deleted uploaded file: ${file.path}`);
            }
          }
        } catch (err) {
          console.error("❌ Embedding error:", err.message);

          await Idea.updateOne(
            { _id: idea_id, "attached_files.file_name": file.file_name },
            { $set: { "attached_files.$.embedding_status": "failed" } }
          );
        }
      }

      await Idea.findByIdAndUpdate(idea_id, {
        embedding_status: "completed",
      });
    },
  });
};

module.exports = { startEmbeddingConsumer };
