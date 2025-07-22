const axios = require("axios");
const fs = require("fs");
const path = require("path");

async function getTranscriptFromRapidAPI(youtubeUrl) {
  const videoId = youtubeUrl.match(
    /(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  )?.[1];

  if (!videoId) {
    console.error("❌ Invalid YouTube URL:", youtubeUrl);
    return null;
  }

  console.log(`🔍 Extracted Video ID: ${videoId}`);

  try {
    console.log("📡 Sending request to RapidAPI...");
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
    console.log("✅ Response received from RapidAPI", response.data);
    const transcriptObj = Array.isArray(response.data)
      ? response.data[0]
      : null;

    if (!transcriptObj || !transcriptObj.transcriptionAsText) {
      console.warn("⚠️ No transcript available for:", videoId);
      return null;
    }

    const text = transcriptObj.transcriptionAsText;

    // Ensure transcript directory exists
    const outputDir = path.join(__dirname, "../public/transcripts");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`📁 Created directory: ${outputDir}`);
    }

    // Write transcript to file
    const filePath = path.join(outputDir, `${videoId}.txt`);
    fs.writeFileSync(filePath, text);

    console.log("✅ Transcript saved successfully:", filePath);
    return filePath;
  } catch (err) {
    console.error(
      "❌ Error fetching transcript from RapidAPI:",
      err.response?.data || err.message
    );
    return null;
  }
}

module.exports = { getTranscriptFromRapidAPI };
