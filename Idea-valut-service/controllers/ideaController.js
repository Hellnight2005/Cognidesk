const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const sharedModels = require("../../shared-models");
const Idea =
  mongoose.models.Idea || mongoose.model("Idea", sharedModels.IdeaSchema);
const sendToKafka = require("../Kafka/producer");
const { deleteFileFromDrive } = require("../utils/driveHelper");
const { deleteEmbeddingsByIdeaId } = require("../utils/embedding");
// 📁 Ensure uploads folder exists
const uploadDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

exports.createIdea = async (req, res) => {
  try {
    // 🧠 Parse external_references from string if sent via Postman/form-data
    if (typeof req.body.external_references === "string") {
      try {
        req.body.external_references = JSON.parse(
          req.body.external_references.trim()
        );
      } catch (err) {
        console.error("Invalid JSON in external_references:", err.message);
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

    // 1️⃣ Save idea metadata in MongoDB
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

    // 2️⃣ Store files on disk
    const savedFiles = [];
    for (const file of req.files || []) {
      const uniqueFilename = `${file.originalname}`;
      const filePath = path.join(uploadDir, uniqueFilename);
      fs.writeFileSync(filePath, file.buffer);

      savedFiles.push({
        file_name: uniqueFilename,
        originalname: file.originalname,
        mimetype: file.mimetype,
        path: filePath,
      });
    }

    // 3️⃣ Send to Kafka with event
    const kafkaPayload = {
      idea_id: newIdea._id,
      user_id: created_by_user_id,
      title: idea_title,
      desc: idea_description,
      category: category,
      sub_category: sub_category,
      files: savedFiles,
      external_references: external_references || [],
      event: "IDEA_CREATED",
    };

    await sendToKafka("idea-file-process", kafkaPayload);

    // 4️⃣ Respond to client
    res.status(201).json({
      message:
        "✅ Idea created successfully. Files and references queued for embedding.",
      idea: newIdea,
    });
  } catch (error) {
    console.error("❌ Error creating idea:", error);
    res.status(500).json({ error: "Failed to create idea." });
  }
};

exports.deleteIdea = async (req, res) => {
  try {
    const ideaId = req.params.id;

    // 1️⃣ Find the idea
    const idea = await Idea.findById(ideaId);
    if (!idea) {
      return res.status(404).json({ message: "Idea not found" });
    }

    // 2️⃣ Delete files from Google Drive
    for (const file of idea.attached_files || []) {
      const match = file.drive_file_link.match(/\/d\/(.*?)\//);
      const fileId = match ? match[1] : null;

      if (fileId) {
        try {
          await deleteFileFromDrive(fileId);
        } catch (err) {
          console.warn(
            `Failed to delete file from Drive: ${fileId}`,
            err.message
          );
        }
      }
    }

    // 3️⃣ Delete embeddings from vector DB (Chroma/Weaviate/etc.)
    try {
      await deleteEmbeddingsByIdeaId(ideaId); // You define this
    } catch (err) {
      console.warn(
        `Failed to delete embeddings for idea ${ideaId}:`,
        err.message
      );
    }

    // 4️⃣ Delete MongoDB record
    await Idea.findByIdAndDelete(ideaId);

    // ✅ Done
    res.json({ message: "Idea and all associated data deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting idea:", error);
    res.status(500).json({ message: "Failed to delete idea" });
  }
};
