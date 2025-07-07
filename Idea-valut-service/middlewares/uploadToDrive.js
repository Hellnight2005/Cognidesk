const { createFolder, findFolder } = require("../utils/driveHelper");
const { googleUploadFiles } = require("../utils/googleDriveUploader");
const mongoose = require("mongoose");
const sharedModels = require("../../shared-models");

const User = mongoose.model("User", sharedModels.UserSchema);

const uploadToDrive = async (req, res, next) => {
  try {
    const { created_by_user_id, file_category, idea_title } = req.body;
    const files = req.files || [];

    if (!created_by_user_id || !file_category || !files.length) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const user = await User.findById(created_by_user_id);
    const accessToken = user?.auth?.providers?.google?.access_token;
    if (!accessToken) {
      return res.status(401).json({ message: "Missing Google token" });
    }

    // Step 1: Find or create "CogniDesk" root folder
    let rootFolderId = await findFolder("CogniDesk", accessToken);
    if (!rootFolderId) {
      rootFolderId = await createFolder("CogniDesk", accessToken);
    }

    // Step 2: Create idea-specific folder
    const safeTitle = idea_title?.replace(/\s+/g, "_") || "Untitled";
    const ideaFolderName = `Idea-${safeTitle}-${Date.now()}`;
    const ideaFolderId = await createFolder(
      ideaFolderName,
      accessToken,
      rootFolderId
    );

    // Step 3: Upload files into idea folder
    const attached_files = await googleUploadFiles(
      files,
      accessToken,
      file_category,
      ideaFolderId,
      created_by_user_id
    );

    // Attach the Drive metadata to the body for saving
    req.body.attached_files = attached_files;
    req.body.drive_folder_id = ideaFolderId;

    next();
  } catch (err) {
    console.error("❌ Upload Middleware Error:", err);
    res
      .status(500)
      .json({ message: "Google Drive upload failed", error: err.message });
  }
};

module.exports = uploadToDrive;
