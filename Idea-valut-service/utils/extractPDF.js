const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

async function extractTextWithPdfParse(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer);

  const text = data.text?.trim() || "";

  if (!text) {
    console.warn(`❌ No extractable text found in: ${pdfPath}`);
    return "";
  }

  console.log(`✅ Extracted text from PDF: ${path.basename(pdfPath)}`);
  return text; // ✅ Always return plain string
}

module.exports = {
  extractTextWithPdfParse,
};
