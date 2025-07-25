const { google } = require("googleapis");
const path = require("path");
const streamifier = require("streamifier");
const axios = require("axios");

/**
 * Uploads multiple files to Google Drive in the specified folder.
 * @param {Array} files - Multer files [{ buffer, originalname, mimetype }]
 * @param {String} accessToken - Access token (will try refreshing if possible)
 * @param {String} category - One of ["Video", "Document", "Image", "Other"]
 * @param {String} parentFolderId - Google Drive folder ID for the idea
 * @param {String} userId - Used to refresh token if needed
 */
exports.googleUploadFiles = async (
  files,
  accessToken,
  category,
  parentFolderId,
  userId
) => {
  const uploaded = [];
  const failed = [];

  try {
    // 🌐 Step 1: Refresh token
    const REFRESH_URL =
      process.env.TOKEN_REFRESH_URL ||
      `http://localhost:3001/api/users/${userId}/revoke/google`;

    let finalToken = accessToken;

    try {
      const refreshRes = await axios.get(REFRESH_URL);
      if (refreshRes.data?.result?.access_token) {
        finalToken = refreshRes.data.result.access_token;
      }
    } catch (err) {
      console.warn(
        "⚠️ Token refresh failed, using original token:",
        err.message
      );
    }

    // 🔐 Step 2: Setup Drive auth
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: finalToken });

    const drive = google.drive({ version: "v3", auth });

    // 📁 Step 3: Upload files
    for (const file of files) {
      try {
        const metadata = {
          name: file.originalname,
          parents: [parentFolderId],
        };

        const driveRes = await drive.files.create({
          requestBody: metadata,
          media: {
            mimeType: file.mimetype,
            body: streamifier.createReadStream(file.buffer),
          },
          fields: "id",
        });

        const fileId = driveRes.data.id;

        uploaded.push({
          file_name: file.originalname,
          file_category: category,
          file_type: path.extname(file.originalname).slice(1),
          drive_folder_link: `https://drive.google.com/drive/folders/${parentFolderId}`,
          drive_file_link: `https://drive.google.com/file/d/${fileId}/view`,
          video_duration_minutes: category === "Video" ? null : null, // Replace if duration is calculated
          uploaded_at: new Date(),
        });
      } catch (uploadErr) {
        console.error(
          `❌ Failed to upload '${file.originalname}':`,
          uploadErr.message
        );
        failed.push({
          file_name: file.originalname,
          error: uploadErr.message,
        });
      }
    }

    return {
      success: uploaded,
      failed,
      message: `✅ Upload completed: ${uploaded.length} success, ${failed.length} failed.`,
    };
  } catch (err) {
    console.error("❌ Fatal upload error:", err.message);
    throw new Error("Google Drive upload failed.");
  }
};
