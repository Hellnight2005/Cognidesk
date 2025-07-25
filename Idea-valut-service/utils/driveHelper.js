const { google } = require("googleapis");
const drive = () => google.drive({ version: "v3" });

/**
 * Generate a Google OAuth2 auth instance.
 */
const getAuth = (accessToken) => {
  if (!accessToken) throw new Error("Access token is required");
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return auth;
};

/**
 * Create a folder in Google Drive.
 * @param {string} name - Folder name.
 * @param {string} accessToken - Google OAuth2 access token.
 * @param {string|null} parentId - Optional parent folder ID.
 */
const createFolder = async (name, accessToken, parentId = null) => {
  if (!name || typeof name !== "string") throw new Error("Invalid folder name");
  const auth = getAuth(accessToken);

  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    ...(parentId ? { parents: [parentId] } : {}),
  };

  try {
    const res = await drive().files.create({
      auth,
      resource: metadata,
      fields: "id",
    });
    return res.data.id;
  } catch (err) {
    console.error("[Drive] Failed to create folder:", err.message);
    throw new Error("Drive: Folder creation failed");
  }
};

/**
 * Find folder by name.
 * Returns first matching folder ID or null.
 */
const findFolder = async (name, accessToken) => {
  if (!name || typeof name !== "string") throw new Error("Invalid folder name");

  const auth = getAuth(accessToken);
  const query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;

  try {
    const res = await drive().files.list({
      auth,
      q: query,
      fields: "files(id, name)",
      spaces: "drive",
    });

    const folders = res.data.files;
    return folders.length > 0 ? folders[0].id : null;
  } catch (err) {
    console.error("[Drive] Failed to find folder:", err.message);
    throw new Error("Drive: Folder search failed");
  }
};

/**
 * Delete a file or folder by ID.
 */
const deleteFileFromDrive = async (fileId, accessToken) => {
  if (!fileId || typeof fileId !== "string") throw new Error("Invalid file ID");

  const auth = getAuth(accessToken);

  try {
    await drive().files.delete({ auth, fileId });
    return { success: true, message: "Deleted successfully" };
  } catch (err) {
    console.error("[Drive] Deletion failed:", err.message);
    throw new Error("Drive: File deletion failed");
  }
};

module.exports = {
  createFolder,
  findFolder,
  deleteFileFromDrive,
};
