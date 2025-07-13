const fs = require("fs");
const path = require("path");
const { Kafka } = require("kafkajs");
const extractTextFromFile = require("../utils/extractText.js");
const generateEmbedding = require("../utils/embedding");
const saveToQdrant = require("../utils/vectorDb");

// Kafka setup
const kafka = new Kafka({
  clientId: "embedder",
  brokers: ["localhost:9092"],
});
const consumer = kafka.consumer({ groupId: "embed-group" });

// Make sure destination folder exists
const EMBEDDING_DIR = path.resolve("public/embeddings");
if (!fs.existsSync(EMBEDDING_DIR))
  fs.mkdirSync(EMBEDDING_DIR, { recursive: true });

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
          const localPath = file.path;
          const filePath = path.resolve(localPath);

          if (!fs.existsSync(filePath)) {
            console.warn(`⚠️ File not found locally: ${filePath}, skipping.`);
            continue;
          }

          console.log(`📄 Extracting text from: ${file.originalname}`);
          const text = await extractTextFromFile(filePath);
          if (!text) continue;

          const embedding = await generateEmbedding(text);
          if (!embedding) continue;

          await saveToQdrant({
            idea_id,
            user_id,
            file_name: file.file_name,
            vector: embedding,
            metadata: {
              idea_id,
              user_id,
              file_name: file.file_name,
              drive_link: file.drive_file_link,
            },
          });

          console.log("✅ File embedded and saved to vector DB");

          // Move file to permanent storage
          const timestampedName = `${Date.now()}_${file.originalname}`;
          const targetPath = path.join(EMBEDDING_DIR, timestampedName);
          fs.renameSync(filePath, targetPath); // move to embedding folder
        } catch (err) {
          console.error("❌ Embedding error:", err);
        }
      }
    },
  });
};

module.exports = { startEmbeddingConsumer };
