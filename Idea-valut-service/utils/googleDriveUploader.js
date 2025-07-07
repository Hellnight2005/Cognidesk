const { google } = require("googleapis");
const path = require("path");
const streamifier = require("streamifier");

/**
 * Uploads multiple files to Google Drive in the specified folder.
 * @param {Array} files - Multer files [{ buffer, originalname, mimetype }]
 * @param {String} accessToken
 * @param {String} category - Enum ["Video", "Document", "Image", "Other"]
 * @param {String} parentFolderId - The idea-specific Google Drive folder ID
 */
exports.googleUploadFiles = async (
  files,
  accessToken,
  category,
  parentFolderId
) => {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  const uploaded = [];

  for (const file of files) {
    const metadata = {
      name: file.originalname,
      parents: [parentFolderId], // ✅ target folder
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
  }

  return uploaded;
};
