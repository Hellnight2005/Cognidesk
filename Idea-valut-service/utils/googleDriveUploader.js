const { google } = require("googleapis");
const path = require("path");
const streamifier = require("streamifier");
const axios = require("axios");

exports.googleUploadFiles = async (
  files,
  accessToken,
  category,
  parentFolderId,
  userId
) => {
  const uploaded = [];
  const failed = [];
  const skipped = [];

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
        // 🔎 Step 3.1: Check if file already exists in folder
        const query = `name='${file.originalname.replace(
          /'/g,
          "\\'"
        )}' and '${parentFolderId}' in parents and trashed=false`;
        const existing = await drive.files.list({
          q: query,
          fields: "files(id, name)",
        });

        if (existing.data.files.length > 0) {
          console.log(
            `⏭️ Skipped upload: '${file.originalname}' already exists`
          );
          skipped.push({
            file_name: file.originalname,
            file_category: category,
            file_type: path.extname(file.originalname).slice(1),
            drive_folder_link: `https://drive.google.com/drive/folders/${parentFolderId}`,
            drive_file_link: `https://drive.google.com/file/d/${existing.data.files[0].id}/view`,
            uploaded_at: new Date(),
          });
          continue; // move to next file
        }

        // 🚀 Step 3.2: Upload new file
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
          video_duration_minutes: category === "Video" ? null : null,
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
      skipped,
      failed,
      message: `✅ Upload finished: ${uploaded.length} uploaded, ${skipped.length} skipped, ${failed.length} failed.`,
    };
  } catch (err) {
    console.error("❌ Fatal upload error:", err.message);
    throw new Error("Google Drive upload failed.");
  }
};
