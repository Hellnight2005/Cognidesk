const path = require("path");
const { extractTextFromPath } = require("./utils/extractText");

const input = path.join(__dirname, "public", "pdf1.pdf");

(async () => {
  try {
    console.log("🚀 Starting text extraction...");
    await extractTextFromPath(input);
    console.log("✅ Text extraction completed successfully!");
  } catch (err) {
    console.error("❌ Error during text extraction:", err.message);
  }
})();
