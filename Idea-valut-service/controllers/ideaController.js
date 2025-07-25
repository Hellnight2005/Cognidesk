const fs = require("fs");
const path = require("path");
const axios = require("axios");
const mongoose = require("mongoose");

const sharedModels = require("../../shared-models");
const Idea =
  mongoose.models.Idea || mongoose.model("Idea", sharedModels.IdeaSchema);

const sendToKafka = require("../Kafka/producer");
const {
  deleteDriveFilesAndFolder, // ✅ added
} = require("../utils/driveHelper");
const { deleteVectorsByIdeaId } = require("../utils/vectorDb");

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

/** ===============================
 * 🎯 CREATE IDEA
 * =============================== */
exports.createIdea = async (req, res) => {
  try {
    // 🔄 Parse external_references if sent as string
    if (typeof req.body.external_references === "string") {
      try {
        req.body.external_references = JSON.parse(
          req.body.external_references.trim()
        );
      } catch (err) {
        console.error("❌ Invalid JSON in external_references:", err.message);
        return res
          .status(400)
          .json({ message: "Invalid format for external_references" });
      }
    }

    const {
      idea_title,
      idea_description,
      category,
      sub_category,
      curiosity_level,
      convert_to_project,
      priority_reason,
      source,
      tags,
      external_references,
      created_by_user_id,
    } = req.body;

    // 1️⃣ Save metadata to MongoDB
    const newIdea = await Idea.create({
      idea_title,
      idea_description,
      category,
      sub_category,
      curiosity_level,
      convert_to_project,
      priority_reason,
      source,
      tags,
      external_references,
      created_by_user_id,
      file_status: "pending",
      embedding_status: "pending",
    });

    // 2️⃣ Save uploaded files (locally)
    const savedFiles = [];
    for (const file of req.files || []) {
      const safeFilename = `${file.originalname.replace(
        /[^a-zA-Z0-9_.-]/g,
        ""
      )}`;
      const filePath = path.join(uploadDir, safeFilename);
      fs.writeFileSync(filePath, file.buffer);

      savedFiles.push({
        file_name: safeFilename,
        originalname: file.originalname,
        mimetype: file.mimetype,
        path: filePath,
      });
    }

    // 3️⃣ Kafka: Queue for async processing
    await sendToKafka("idea-file-process", {
      idea_id: newIdea._id,
      user_id: created_by_user_id,
      title: idea_title,
      desc: idea_description,
      category,
      sub_category,
      files: savedFiles,
      external_references: external_references || [],
      event: "IDEA_CREATED",
    });

    // ✅ Respond
    res.status(201).json({
      message: "✅ Idea created. Files and references queued for embedding.",
      idea: newIdea,
    });
  } catch (error) {
    console.error("❌ Error creating idea:", error);
    res.status(500).json({ message: "Failed to create idea." });
  }
};

/** ===============================
 * 🗑️ DELETE IDEA
 * =============================== */
exports.deleteIdea = async (req, res) => {
  try {
    const ideaId = req.params.id;

    // 1️⃣ Find the idea
    const idea = await Idea.findById(ideaId);
    if (!idea) return res.status(404).json({ message: "Idea not found" });

    const userId = idea.created_by_user_id;
    let accessToken = req.headers["x-google-access-token"] || null;

    // 2️⃣ Fetch user to get Google access token (if not passed in header)
    if (!accessToken && userId) {
      try {
        const { data: user } = await axios.get(
          `http://localhost:3001/api/users/${userId}`
        );
        accessToken = user?.auth?.providers?.google?.access_token || null;
      } catch (err) {
        console.warn(
          `⚠️ Unable to fetch user (${userId}) for Drive access token:`,
          err.message
        );
      }
    }

    // 3️⃣ Delete files & folders from Google Drive
    if (accessToken) {
      try {
        await deleteDriveFilesAndFolder(idea.attached_files, accessToken);
      } catch (err) {
        console.warn("❌ Drive file/folder deletion failed:", err.message);
      }
    } else {
      console.warn(
        "⚠️ No Google access token provided. Skipping Drive cleanup."
      );
    }

    // 4️⃣ Delete from vector DB
    try {
      await deleteVectorsByIdeaId(ideaId);
    } catch (err) {
      console.warn(
        `❌ Vector DB deletion failed for idea ${ideaId}:`,
        err.message
      );
    }

    // 5️⃣ Delete MongoDB record
    await Idea.findByIdAndDelete(ideaId);

    res.json({
      message: "✅ Idea and all associated data deleted successfully.",
    });
  } catch (error) {
    console.error("❌ Error deleting idea:", error);
    res.status(500).json({ message: "Internal error while deleting idea." });
  }
};
