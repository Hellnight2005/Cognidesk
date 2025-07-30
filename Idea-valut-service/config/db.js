const mongoose = require("mongoose");
const { startDriveConsumer } = require("../Kafka/consumer-upload");
const { startEmbeddingConsumer } = require("../Kafka/consumer-embedding");

mongoose.set("strictQuery", false);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
    });

    console.log("🟢 Connected to MongoDB");

    // Start both Kafka consumers (each has its own group ID)
    try {
      await Promise.all([
        startDriveConsumer(), // Group A - uploads to drive

        // startEmbeddingConsumer(), // Group B - embeds to vector DB
      ]);
      console.log("🔄 Kafka consumers started");
    } catch (err) {
      console.error("❌ Failed to start Kafka consumers:", err.message);
      process.exit(1);
    }

    // Graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\n🛑 Shutting down gracefully...");
      await mongoose.disconnect();
      process.exit(0);
    });
  } catch (err) {
    console.error("🔴 MongoDB connection error:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
