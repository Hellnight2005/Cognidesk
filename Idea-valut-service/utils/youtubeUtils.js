relod
const axios = require("axios");
const fs = require("fs");
const path = require("path");

async function getTranscriptFromRapidAPI(youtubeUrl) {
  const videoId = youtubeUrl.match(
    /(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  )?.[1];
  if (!videoId) throw new Error("❌ Invalid YouTube URL");

  try {
    const response = await axios.get(
      "https://youtube-transcriptor.p.rapidapi.com/transcript",
      {
        params: {
          video_id: videoId,
          lang: "en",
        },
        headers: {
          "x-rapidapi-key": process.env.RAPIDAPI_KEY,
          "x-rapidapi-host": "youtube-transcriptor.p.rapidapi.com",
        },
      }
    );

    const transcriptObj = Array.isArray(response.data)
      ? response.data[0]
      : null;

    if (!transcriptObj || !transcriptObj.transcriptionAsText) {
      console.warn("⚠️ No transcript available.");
      return null;
    }

    const text = transcriptObj.transcriptionAsText;

    // Save to file
    const outputDir = path.join(__dirname, "../public/transcripts");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const filePath = path.join(outputDir, `${videoId}.txt`);
    fs.writeFileSync(filePath, text);

    console.log("✅ Transcript saved at:", filePath);
    return filePath;
  } catch (err) {
    console.error(
      "❌ Error fetching transcript:",
      err.response?.data || err.message
    );
    return null;
  }
}

module.exports = { getTranscriptFromRapidAPI };
