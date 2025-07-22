const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const outputDir = path.join(__dirname, "../public/converted");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function saveToPublicFile(baseName, text) {
  const safeName = baseName.replace(/[^a-z0-9]/gi, "_").toLowerCase(); // Fix: replaced `.replace.` with `.replace()`
  const filePath = path.join(outputDir, `${safeName}.txt`);
  fs.writeFileSync(filePath, text, "utf-8");
  console.log(`✅ Saved to ${filePath}`);
  return filePath;
}

async function extractTextWithPdfParse(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer);

  const text = data.text.trim();
  const baseName = path.basename(pdfPath, path.extname(pdfPath));

  if (text) {
    const savedPath = saveToPublicFile(baseName, text);
    return {
      message: "✅ Text extracted successfully using pdf-parse.",
      path: savedPath,
    };
  } else {
    return { message: "❌ No extractable text found in PDF." };
  }
}

module.exports = {
  extractTextWithPdfParse,
};
