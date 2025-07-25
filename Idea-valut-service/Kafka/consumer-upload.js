require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const axios = require("axios");
const { Kafka } = require("kafkajs");

const sharedModels = require("../../shared-models");
const { googleUploadFiles } = require("../utils/googleDriveUploader");
const {
  findFolder,
  createFolder,
  getOrCreateRootFolder,
} = require("../utils/driveHelper");

const USER_SERVICE_URL = process.env.USER_SERVICE_URL;
if (!USER_SERVICE_URL) throw new Error("❌ USER_SERVICE_URL is not set");

const Idea =
  mongoose.models.Idea || mongoose.model("Idea", sharedModels.IdeaSchema);

const kafka = new Kafka({
  clientId: "drive-uploader",
  brokers: process.env.KAFKA_BROKERS?.split(",") || ["localhost:9092"],
});

const consumer = kafka.consumer({ groupId: "drive-uploader-group" });

function detectFileCategory(mimetype) {
  if (mimetype.startsWith("video/")) return "Video";
  if (mimetype.startsWith("image/")) return "Image";
  if (["application/pdf", "text/plain", "text/markdown"].includes(mimetype))
    return "Document";
  return "Other";
}

function sanitizeTitle(title = "Untitled") {
  return title.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");
}

async function getGoogleAccessToken(userId) {
  try {
    const res = await axios.get(
      `${USER_SERVICE_URL}/api/users/${userId}/revoke/google`
    );
    return res?.data?.result?.access_token || null;
  } catch (err) {
    throw new Error(
      `Token fetch failed: ${err.response?.data?.message || err.message}`
    );
  }
}

async function startDriveConsumer() {
  await consumer.connect();
  await consumer.subscribe({
    topic: "idea-file-process",
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      let payload;
      try {
        payload = JSON.parse(message.value.toString());
      } catch (err) {
        console.error("❌ Invalid Kafka message format:", err.message);
        return;
      }

      const { idea_id: ideaId, user_id: userId, files = [] } = payload;
      if (!ideaId || !userId) {
        console.error("❌ Missing idea_id or user_id in Kafka payload.");
        return;
      }

      try {
        const idea = await Idea.findById(ideaId);
        if (!idea) throw new Error(`Idea not found for ID: ${ideaId}`);

        const accessToken = await getGoogleAccessToken(userId);
        if (!accessToken)
          throw new Error("Access token was not returned from user service");

        // ✅ Use the new helper
        const rootFolderId = await getOrCreateRootFolder(accessToken);

        const ideaFolderName = `${idea.idea_title}`;

        const parentFolderId = await createFolder(
          ideaFolderName,
          accessToken,
          rootFolderId
        );

        const bufferFiles = [];

        for (const file of files) {
          const filePath = path.resolve(file.path);
          if (!fs.existsSync(filePath)) {
            console.warn(`⚠️ File missing: ${filePath}`);
            continue;
          }

          const buffer = fs.readFileSync(filePath);
          const ext = path.extname(file.originalname);
          const fileName = `${path.basename(file.originalname, ext)}${ext}`;

          bufferFiles.push({
            buffer,
            originalname: fileName,
            original_name: file.originalname,
            mimetype: file.mimetype,
          });
        }

        if (bufferFiles.length === 0)
          throw new Error("No valid files found to upload.");

        const uploadResult = await googleUploadFiles(
          bufferFiles,
          accessToken,
          "Document",
          parentFolderId,
          userId
        );

        if (!uploadResult || !Array.isArray(uploadResult.success)) {
          console.error("❌ Invalid upload result:", uploadResult);
          throw new Error(
            "Upload failed: googleUploadFiles() did not return expected format."
          );
        }

        const uploadedFiles = uploadResult.success.map((upload, idx) => {
          const original = bufferFiles[idx];
          return {
            originalname: original.original_name,
            file_name: upload.file_name,
            file_category: detectFileCategory(original.mimetype),
            file_type: original.mimetype,
            drive_folder_link: upload.drive_folder_link,
            drive_file_link: upload.drive_file_link,
            video_duration_minutes: null,
            uploaded_at: upload.uploaded_at,
          };
        });

        if (uploadResult.failed?.length > 0) {
          console.warn(
            `⚠️ ${uploadResult.failed.length} files failed to upload.`
          );
          console.warn(uploadResult.failed);
        }

        await Idea.findByIdAndUpdate(ideaId, {
          $push: { attached_files: { $each: uploadedFiles } },
          $set: { file_status: "uploaded", drive_folder_id: parentFolderId },
        });

        console.log(
          `✅ Uploaded ${uploadedFiles.length} files for idea ${ideaId}`
        );

        // Optional: Retain files for audit, or delete them manually if needed
        console.log("🗂️ Local files retained for audit or processing.");
      } catch (err) {
        console.error("❌ Upload process failed:", err.stack || err.message);
        try {
          await Idea.findByIdAndUpdate(ideaId, { file_status: "failed" });
        } catch (dbErr) {
          console.error("❌ DB update failed:", dbErr.stack || dbErr.message);
        }
      }
    },
  });
}

module.exports = { startDriveConsumer };
