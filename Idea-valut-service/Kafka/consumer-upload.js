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
      let payload;
      try {
        payload = JSON.parse(message.value.toString());
        console.log("📦 Kafka message received:", payload);
      } catch (err) {
        console.error("❌ Failed to parse Kafka message:", err);
        return;
      }

      const { idea_id: ideaId, user_id: userId, files } = payload;

      if (!ideaId || !userId) {
        console.error("❌ Missing ideaId or userId in message");
        return;
      }

      try {
        const idea = await Idea.findById(ideaId);
        if (!idea) throw new Error(`Idea not found for ID: ${ideaId}`);

        const tokenRes = await axios.get(
          `http://localhost:3001/api/users/${userId}/revoke/google`
        );
        const accessToken = tokenRes?.data?.result?.access_token;
        if (!accessToken) throw new Error("Failed to refresh Google token");

        let rootFolderId = await findFolder("CogniDesk", accessToken);
        if (!rootFolderId)
          rootFolderId = await createFolder("CogniDesk", accessToken);

        const safeTitle = idea.idea_title?.replace(/\s+/g, "_") || "Untitled";
        const ideaFolderName = `Idea-${safeTitle}-${Date.now()}`;
        const parentFolderId = await createFolder(
          ideaFolderName,
          accessToken,
          rootFolderId
        );

        const timestamp = Date.now();
        const bufferFiles = [];

        for (const file of files || []) {
          const filePath = path.resolve(file.path);
          if (!fs.existsSync(filePath)) {
            console.warn("⚠️ File not found on disk:", filePath);
            continue;
          }

          const buffer = fs.readFileSync(filePath);
          const ext = path.extname(file.originalname);
          const baseName = path.basename(file.originalname, ext);
          const renamedName = `${timestamp}_${baseName}${ext}`;

          bufferFiles.push({
            buffer,
            originalname: renamedName,
            original_name: file.originalname,
            mimetype: file.mimetype,
          });
        }

        if (bufferFiles.length === 0)
          throw new Error("No valid files found to upload");

        const rawUploads = await googleUploadFiles(
          bufferFiles,
          accessToken,
          "Document",
          parentFolderId,
          userId
        );

        const uploadedFiles = rawUploads.map((uploaded, idx) => ({
          ...uploaded,
          original_name: bufferFiles[idx].original_name,
        }));

        await Idea.findByIdAndUpdate(ideaId, {
          $push: { attached_files: { $each: uploadedFiles } },
          $set: {
            file_status: "uploaded",
            drive_folder_id: parentFolderId,
          },
        });

        console.log(
          "🗂️ Local files retained:",
          files.map((f) => f.path)
        );
        console.log(
          `✅ Uploaded ${uploadedFiles.length} files for idea ${ideaId}`
        );
      } catch (err) {
        console.error("❌ Drive uploader failed:", err.stack || err.message);
        try {
          await Idea.findByIdAndUpdate(ideaId, { file_status: "failed" });
        } catch (mongoErr) {
          console.error(
            "❌ Failed to update Idea status in MongoDB:",
            mongoErr.stack || mongoErr.message
          );
        }
      }
    },
  });
}

module.exports = { startDriveConsumer };
