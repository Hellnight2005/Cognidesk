const path = require("path");
const fs = require("fs");
const mammoth = require("mammoth");
const PDFParser = require("pdf2json");
const { getAudioTranscript, getVideoTranscript } = require("./transcribe");
const { scrapeWebsite } = require("./webScraper.js");
const { extractYouTubeTranscript } = require("./youtubeUtils");

// Check if file is over a certain size (in GB)
function isLargeFile(filePath, maxGB = 1) {
  const stats = fs.statSync(filePath);
  const sizeInGB = stats.size / 1024 ** 3;
  return sizeInGB > maxGB;
}

// 📄 Efficient PDF extraction (stream-based)
function extractLargePdfText(pdfPath) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    pdfParser.on("pdfParser_dataError", (err) => reject(err.parserError));
    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      const text = pdfData?.formImage?.Pages?.map((page) =>
        page.Texts.map((t) =>
          decodeURIComponent(t.R.map((r) => r.T).join(""))
        ).join(" ")
      ).join("\n\n");

      resolve(text || "");
    });

    pdfParser.loadPDF(pdfPath);
  });
}

// 📝 Word document (.docx) extraction
async function extractDocText(docPath) {
  const result = await mammoth.extractRawText({ path: docPath });
  return result.value;
}

// 🌐 Universal entry point
async function extractTextFromFile(filePathOrUrl) {
  try {
    // 🎥 YouTube
    if (
      typeof filePathOrUrl === "string" &&
      filePathOrUrl.includes("youtube.com")
    ) {
      return await extractYouTubeTranscript(filePathOrUrl);
    }

    // 🌍 Website/blog
    if (filePathOrUrl.startsWith("http")) {
      return await scrapeWebsite(filePathOrUrl);
    }

    const ext = path.extname(filePathOrUrl).toLowerCase();

    // PDF
    if (ext === ".pdf") {
      return await extractLargePdfText(filePathOrUrl);
    }

    // Word
    if (ext === ".docx" || ext === ".doc") {
      return await extractDocText(filePathOrUrl);
    }

    // Audio
    if ([".mp3", ".wav", ".m4a"].includes(ext)) {
      return await getAudioTranscript(filePathOrUrl);
    }

    // Video
    if ([".mp4", ".mov", ".mkv"].includes(ext)) {
      return await getVideoTranscript(filePathOrUrl);
    }

    return "";
  } catch (err) {
    console.error("❌ Error in extractTextFromFile:", err.message);
    return "";
  }
}

module.exports = extractTextFromFile;
