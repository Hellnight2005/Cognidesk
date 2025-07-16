const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const axios = require("axios");
const { Kafka } = require("kafkajs");

const sharedModels = require("../../shared-models");
const { googleUploadFiles } = require("../utils/googleDriveUploader");
const { findFolder, createFolder } = require("../utils/driveHelper");

const Idea =
  mongoose.models.Idea || mongoose.model("Idea", sharedModels.IdeaSchema);

// Kafka setup
const kafka = new Kafka({
  clientId: "drive-uploader",
  brokers: ["localhost:9092"],
});

const consumer = kafka.consumer({ groupId: "drive-uploader-group" });

async function startDriveConsumer() {
  await consumer.connect();
  await consumer.subscribe({
    topic: "idea-file-process",
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const { ideaId, userId, files } = JSON.parse(message.value.toString());

      try {
        const idea = await Idea.findById(ideaId);
        if (!idea) throw new Error("Idea not found");

        // Step 1: Refresh user's Google token using Axios
        const tokenRes = await axios.get(
          `http://localhost:3001/api/users/${userId}/revoke/google`
        );
        const accessToken = tokenRes?.data?.result?.access_token;
        if (!accessToken) throw new Error("Failed to refresh Google token");

        // Step 2: Find or create "CogniDesk" root folder
        let rootFolderId = await findFolder("CogniDesk", accessToken);
        if (!rootFolderId) {
          rootFolderId = await createFolder("CogniDesk", accessToken);
        }

        // Step 3: Create unique folder for this idea
        const safeTitle = idea.idea_title?.replace(/\s+/g, "_") || "Untitled";
        const ideaFolderName = `Idea-${safeTitle}-${Date.now()}`;
        const parentFolderId = await createFolder(
          ideaFolderName,
          accessToken,
          rootFolderId
        );

        // Step 4: Prepare files with renamed names and original name tracking
        const timestamp = Date.now();
        const bufferFiles = files.map((file) => {
          const filePath = path.resolve(file.path);
          const buffer = fs.readFileSync(filePath);
          const ext = path.extname(file.originalname);
          const baseName = path.basename(file.originalname, ext);
          const renamedName = `${timestamp}_${baseName}${ext}`;

          return {
            buffer,
            originalname: renamedName,
            original_name: file.originalname, // Track original for MongoDB
            mimetype: file.mimetype,
          };
        });

        // Step 5: Upload to Google Drive
        const rawUploads = await googleUploadFiles(
          bufferFiles,
          accessToken,
          "Document",
          parentFolderId,
          userId
        );

        // Step 6: Add original_name to each uploaded file object
        const uploadedFiles = rawUploads.map((uploaded, idx) => ({
          ...uploaded,
          original_name: bufferFiles[idx].original_name, // Keep original file name
        }));

        // Step 7: Update MongoDB
        await Idea.findByIdAndUpdate(ideaId, {
          $push: { attached_files: { $each: uploadedFiles } },
          $set: {
            file_status: "uploaded",
            drive_folder_id: parentFolderId,
          },
        });

        // Step 8: Log file retention
        console.log(
          "🗂️ Local files retained:",
          files.map((f) => f.path)
        );
        console.log(
          `✅ Uploaded ${uploadedFiles.length} files for idea ${ideaId}`
        );
      } catch (err) {
        console.error("❌ Drive uploader failed:", err.message);
        await Idea.findByIdAndUpdate(ideaId, { file_status: "failed" });
      }
    },
  });
}

module.exports = { startDriveConsumer };
