const { google } = require("googleapis");
const drive = () => google.drive({ version: "v3" });

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

module.exports = { createFolder, findFolder };
