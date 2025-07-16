const fs = require("fs");
const path = require("path");
const {
  ensureCollection,
  saveToQdrant,
  searchFromQdrant,
} = require("./utils/vectorDb");
const embedTextFileAndSave = require("./utils/embedding");

(async () => {
  try {
    console.log("🚀 Starting Vector DB embedding test...");

    // Step 1: Ensure Qdrant collection exists
    console.log("🔧 Ensuring Qdrant collection...");
    await ensureCollection();

    // Step 2: Define path to file
    const filePath = path.resolve("public/converted/pdf_pdf1.txt");

    // Step 3: Start embedding and saving
    console.log("📦 Embedding and saving vector chunks...");
    await embedTextFileAndSave(filePath);

    console.log("✅ All done!");
  } catch (err) {
    console.error("❌ Test error:", err.message);
  }
})();
