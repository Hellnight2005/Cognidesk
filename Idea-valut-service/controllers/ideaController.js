const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const sharedModels = require("../../shared-models");
const Idea =
  mongoose.models.Idea || mongoose.model("Idea", sharedModels.IdeaSchema);

const sendToKafka = require("../Kafka/producer");

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

exports.createIdea = async (req, res) => {
  try {
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

    // 1. Create idea metadata in MongoDB
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

    // 2. Save each file to disk
    const savedFiles = [];
    for (const file of req.files) {
      const uniqueFilename = `${Date.now()}-${file.originalname}`;
      const filePath = path.join(uploadDir, uniqueFilename);
      fs.writeFileSync(filePath, file.buffer);

      savedFiles.push({
        originalname: file.originalname,
        mimetype: file.mimetype,
        path: filePath,
      });
    }

    // 3. Send metadata to Kafka
    const kafkaPayload = {
      ideaId: newIdea._id,
      userId: created_by_user_id,
      files: savedFiles, // includes file path + mimetype + name
    };

    await sendToKafka("idea-file-process", kafkaPayload);

    // 4. Respond to client
    res.status(201).json({
      message:
        "Idea created successfully. Files saved and queued for processing.",
      idea: newIdea,
    });
  } catch (error) {
    console.error("❌ Error creating idea:", error);
    res.status(500).json({ error: "Failed to create idea." });
  }
};

// exports.getIdeaSummary = async (req, res) => {
//   try {
//     const ideaId = req.params.id;
//     // You can summarize content or return dummy response for now
//     res.json({ message: `Summary for idea ${ideaId}` });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Failed to get summary." });
//   }
// };
