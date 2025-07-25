const { google } = require("googleapis");
const drive = () => google.drive({ version: "v3" });

// 🔧 Create a new folder in Google Drive
const createFolder = async (name, accessToken, parentId = null) => {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const fileMetadata = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    ...(parentId ? { parents: [parentId] } : {}),
  };

  const res = await drive().files.create({
    auth,
    resource: fileMetadata,
    fields: "id",
  });

  return res.data.id;
};

// 🔍 Find a folder by name
const findFolder = async (name, accessToken) => {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
  const res = await drive().files.list({
    auth,
    q,
    fields: "files(id, name)",
  });

  return res.data.files[0]?.id || null;
};

// ✅ Get or create root folder "CogniDesk"
const getOrCreateRootFolder = async (accessToken) => {
  let rootFolderId = await findFolder("CogniDesk", accessToken);
  if (!rootFolderId) {
    console.log("📁 'CogniDesk' folder not found. Creating...");
    rootFolderId = await createFolder("CogniDesk", accessToken);
    console.log("✅ 'CogniDesk' folder created:", rootFolderId);
  } else {
    console.log("📁 'CogniDesk' folder found:", rootFolderId);
  }
  return rootFolderId;
};

/**
 * Deletes individual files AND their parent folder from Google Drive.
 * @param {Array} attachedFiles - Array of file objects containing drive_file_link and drive_folder_link
 * @param {string} accessToken - Google OAuth2 access token
 */
async function deleteDriveFilesAndFolder(attachedFiles, accessToken) {
  if (!accessToken || !attachedFiles?.length) return;

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: "v3", auth });

  const folderIdSet = new Set();

  // 1️⃣ Delete all files
  for (const file of attachedFiles) {
    try {
      const fileId = extractFileId(file.drive_file_link);
      const folderId = extractFolderId(file.drive_folder_link);
      if (folderId) folderIdSet.add(folderId);

      if (fileId) {
        await drive.files.delete({ fileId });
        console.log(`🗑️ Deleted file: ${fileId}`);
      }
    } catch (err) {
      console.warn(`⚠️ Failed to delete file:`, err.message);
    }
  }

  // 2️⃣ Delete the parent folder (once per unique folderId)
  for (const folderId of folderIdSet) {
    try {
      await drive.files.delete({ fileId: folderId });
      console.log(`📁 Deleted folder: ${folderId}`);
    } catch (err) {
      console.warn(`⚠️ Failed to delete folder ${folderId}:`, err.message);
    }
  }
}

/**
 * Extracts fileId from a drive link like:
 * https://drive.google.com/file/d/1abcXYZ/view
 */
function extractFileId(driveFileLink) {
  const match = driveFileLink?.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Extracts folderId from a link like:
 * https://drive.google.com/drive/folders/1abcXYZ
 */
function extractFolderId(folderLink) {
  const match = folderLink?.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

module.exports = {
  createFolder,
  findFolder,
  getOrCreateRootFolder,
  deleteDriveFilesAndFolder,
};
