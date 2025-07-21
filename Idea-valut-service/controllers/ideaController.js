const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const sharedModels = require("../../shared-models");
const Idea =
  mongoose.models.Idea || mongoose.model("Idea", sharedModels.IdeaSchema);
const sendToKafka = require("../Kafka/producer");

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
