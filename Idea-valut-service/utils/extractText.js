const path = require("path");
const fs = require("fs");
const mammoth = require("mammoth");

/**
 * Save extracted text to /public/converted/{prefix_filename}.txt
 */
function saveToTextFile(baseName, text) {
  const outputDir = path.join(__dirname, "public", "converted");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const safeName = baseName.replace(/\W+/g, "_").toLowerCase();
  const filePath = path.join(outputDir, `${safeName}.txt`);
  fs.writeFileSync(filePath, text, "utf-8");
  console.log(`✅ Saved: ${filePath}`);
}

/**
 * Extract text from a single file (.docx, .md, .txt)
 */
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath, ext);

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    saveToTextFile(`docx_${baseName}`, result.value || "");
  } else if (ext === ".md" || ext === ".txt") {
    const text = fs.readFileSync(filePath, "utf-8");
    saveToTextFile(`text_${baseName}`, text);
  } else {
    console.log(`⏭️ Skipped unsupported file: ${filePath}`);
  }
}

/**
 * Main function to extract all valid text files in a folder
 * @param {string} inputDir - Path to the folder containing files
 */
async function extractTextFromFolder(inputDir) {
  if (!fs.existsSync(inputDir)) {
    console.error("❌ Input directory does not exist:", inputDir);
    return;
  }

  const files = fs.readdirSync(inputDir);

  for (const file of files) {
    const fullPath = path.join(inputDir, file);
    const stats = fs.statSync(fullPath);
    if (stats.isFile()) {
      await extractText(fullPath);
    }
  }
}

module.exports = {
  extractTextFromFolder,
};
