const path = require("path");
const fs = require("fs");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

/**
 * Save extracted text to /public/converted/{prefix_filename}.txt
 */
function saveToTextFile(baseName, text) {
  const outputDir = path.join(__dirname, "..", "public", "converted");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const safeName = baseName.replace(/\W+/g, "_").toLowerCase();
  const filePath = path.join(outputDir, `${safeName}.txt`);
  fs.writeFileSync(filePath, text, "utf-8");
  console.log(`✅ Saved: ${filePath}`);
}

/**
 * Extract text from a single file (.docx, .md, .txt, .pdf)
 */
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath, ext);

  try {
    if (ext === ".docx") {
      const result = await mammoth.extractRawText({ path: filePath });
      saveToTextFile(`docx_${baseName}`, result.value || "");
    } else if (ext === ".md" || ext === ".txt") {
      const text = fs.readFileSync(filePath, "utf-8");
      saveToTextFile(`text_${baseName}`, text);
    } else if (ext === ".pdf") {
      const buffer = fs.readFileSync(filePath);
      const result = await pdfParse(buffer);
      saveToTextFile(`pdf_${baseName}`, result.text || "");
    } else {
      console.log(`⏭️ Skipped unsupported file: ${filePath}`);
    }
  } catch (err) {
    console.error(`❌ Failed to extract ${filePath}:`, err.message);
  }
}

/**
 * Accept either a file or a folder of files
 */
async function extractTextFromPath(inputPath) {
  if (!fs.existsSync(inputPath)) {
    console.error("❌ Path does not exist:", inputPath);
    return;
  }

  const stats = fs.statSync(inputPath);

  if (stats.isFile()) {
    await extractText(inputPath);
  } else if (stats.isDirectory()) {
    const files = fs.readdirSync(inputPath);
    for (const file of files) {
      const fullPath = path.join(inputPath, file);
      if (fs.statSync(fullPath).isFile()) {
        await extractText(fullPath);
      }
    }
  } else {
    console.error("❌ Input is neither file nor directory:", inputPath);
  }
}

module.exports = {
  extractTextFromPath,
};
