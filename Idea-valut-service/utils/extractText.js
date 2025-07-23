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
    let text = "";

    if (ext === ".docx") {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value || "";
    } else if (ext === ".md" || ext === ".txt") {
      text = fs.readFileSync(filePath, "utf-8");
    } else if (ext === ".pdf") {
      const buffer = fs.readFileSync(filePath);
      const result = await pdfParse(buffer);
      text = result.text || "";
    } else {
      console.log(`⏭️ Skipped unsupported file: ${filePath}`);
      return;
    }

    const cleaned = text.trim();
    if (!cleaned || cleaned.length < 10) {
      throw new Error("No meaningful text extracted");
    }

    saveToTextFile(`${baseName}`, cleaned);
  } catch (err) {
    console.error(`❌ Failed to extract ${filePath}:`, err.message);
    throw err;
  }
}

/**
 * Accept either a file or a folder of files
 */
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath, ext);

  try {
    let text = "";

    if (ext === ".docx") {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value || "";
    } else if (ext === ".md" || ext === ".txt") {
      text = fs.readFileSync(filePath, "utf-8");
    } else if (ext === ".pdf") {
      const buffer = fs.readFileSync(filePath);
      const result = await pdfParse(buffer);
      text = result.text || "";
    } else {
      console.log(`⏭️ Skipped unsupported file: ${filePath}`);
      return null;
    }

    const cleaned = text.trim();
    if (!cleaned || cleaned.length < 10) {
      throw new Error("No meaningful text extracted");
    }

    saveToTextFile(`${baseName}`, cleaned);
    return cleaned;
  } catch (err) {
    console.error(`❌ Failed to extract ${filePath}:`, err.message);
    throw err;
  }
}

// ✨ UPDATED to return the actual extracted text
async function extractTextFromPath(inputPath) {
  if (!fs.existsSync(inputPath)) {
    console.error("❌ Path does not exist:", inputPath);
    return null;
  }

  const stats = fs.statSync(inputPath);

  if (stats.isFile()) {
    return await extractText(inputPath);
  } else if (stats.isDirectory()) {
    const files = fs.readdirSync(inputPath);
    for (const file of files) {
      const fullPath = path.join(inputPath, file);
      if (fs.statSync(fullPath).isFile()) {
        const text = await extractText(fullPath);
        if (text) return text;
      }
    }
    return null;
  } else {
    console.error("❌ Input is neither file nor directory:", inputPath);
    return null;
  }
}

module.exports = {
  extractTextFromPath,
};
