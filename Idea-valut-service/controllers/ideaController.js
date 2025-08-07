const fs = require("fs");
const path = require("path");
const axios = require("axios");
const mongoose = require("mongoose");

const sharedModels = require("../../shared-models");
const sendToKafka = require("../Kafka/producer");
const { deleteDriveFilesAndFolder } = require("../utils/driveHelper");
const { deleteVectorsByIdeaId } = require("../utils/vectorDb");

const Idea =
  mongoose.models.Idea || mongoose.model("Idea", sharedModels.IdeaSchema);

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "..", "public", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

/** ===============================
 * 🎯 CREATE IDEA
 * =============================== */
exports.createIdea = async (req, res) => {
  try {
    // Parse fields that may arrive as JSON strings
    ["external_references", "notes_on_progress", "risks_or_challenges"].forEach(
      (field) => {
        if (typeof req.body[field] === "string") {
          try {
            req.body[field] = JSON.parse(req.body[field].trim());
          } catch (err) {
            console.warn(`⚠️ Invalid JSON for ${field}:`, err.message);
            req.body[field] = [];
          }
        }
      }
    );

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
      external_references = [],
      notes_on_progress = [],
      risks_or_challenges = [],
      created_by_user_id,
    } = req.body;

    // Validate required fields
    if (!idea_title || !created_by_user_id) {
      return res.status(400).json({ message: "❌ Missing required fields" });
    }

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
      external_references: external_references.map((ref) => ({
        label: ref.label || "Reference",
        url: ref.url || null,
        date: ref.date || new Date(),
      })),
      notes_on_progress: notes_on_progress.map((n) => ({
        note: n.note,
        date: n.date || new Date(),
      })),
      risks_or_challenges: risks_or_challenges.map((r) => ({
        note: r.note,
        date: r.date || new Date(),
      })),
      created_by_user_id,
      file_status: "pending",
      embedding_status: "pending",
    });

    // Save uploaded files to disk
    const savedFiles = [];
    for (const file of req.files || []) {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = `${Date.now()}-${file.originalname.replace(
        /[^a-zA-Z0-9_.-]/g,
        ""
      )}`;

      const filePath = path.join(uploadDir, safeName);
      fs.writeFileSync(filePath, file.buffer);

      savedFiles.push({
        file_name: safeName,
        originalname: file.originalname,
        mimetype: file.mimetype,
        path: filePath,
      });
    }

    // Queue for file processing
    await sendToKafka("idea-file-process", {
      idea_id: newIdea._id,
      user_id: created_by_user_id,
      title: idea_title,
      desc: idea_description,
      category,
      sub_category,
      files: savedFiles,
      external_references,
      event: "IDEA_CREATED",
    });

    res.status(201).json({
      message: "✅ Idea created successfully. Files queued for processing.",
      idea: newIdea,
    });
  } catch (error) {
    console.error("❌ Error creating idea:", error);
    res
      .status(500)
      .json({ message: "Internal server error while creating idea" });
  }
};

/** ===============================
 * 🗑️ DELETE IDEA
 * =============================== */
exports.deleteIdea = async (req, res) => {
  try {
    const ideaId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(ideaId)) {
      return res.status(400).json({ message: "Invalid Idea ID" });
    }

    const idea = await Idea.findById(ideaId);
    if (!idea) return res.status(404).json({ message: "Idea not found" });

    const userId = idea.created_by_user_id;
    let accessToken = req.headers["x-google-access-token"] || null;

    if (!accessToken && userId) {
      try {
        const { data: user } = await axios.get(
          `http://localhost:3001/api/users/${userId}`
        );
        accessToken = user?.auth?.providers?.google?.access_token || null;
      } catch (err) {
        console.warn(`⚠️ Could not fetch user token:`, err.message);
      }
    }

    if (accessToken) {
      try {
        await deleteDriveFilesAndFolder(idea.attached_files, accessToken);
      } catch (err) {
        console.warn("❌ Drive deletion error:", err.message);
      }
    }

    try {
      await deleteVectorsByIdeaId(ideaId);
    } catch (err) {
      console.warn("❌ Vector DB deletion error:", err.message);
    }

    await Idea.findByIdAndDelete(ideaId);

    res.json({ message: "✅ Idea and associated data deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting idea:", error);
    res.status(500).json({ message: "Internal error while deleting idea." });
  }
};

/** ===============================
 * ✏️ UPDATE IDEA
 * =============================== */
exports.updateIdea = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Idea ID" });
    }

    const updatePayload = req.body;
    const idea = await Idea.findById(id);
    if (!idea) return res.status(404).json({ message: "❌ Idea not found" });

    // Direct field updates
    const directFields = [
      "idea_description",
      "category",
      "curiosity_level",
      "convert_to_project",
      "priority_reason",
      "completion_status",
      "importance_level",
      "fun_rating",
      "usefulness_rating",
    ];

    directFields.forEach((field) => {
      if (updatePayload[field] !== undefined) {
        idea[field] = updatePayload[field];
      }
    });

    // Avoid duplicate risks_or_challenges entries
    if (Array.isArray(updatePayload.risks_or_challenges)) {
      updatePayload.risks_or_challenges.forEach((item) => {
        const exists = idea.risks_or_challenges.some(
          (r) =>
            r.note === item.note &&
            new Date(r.date).toISOString() === new Date(item.date).toISOString()
        );
        if (item.note && !exists) {
          idea.risks_or_challenges.push({
            note: item.note,
            date: item.date || new Date(),
          });
        }
      });
    }

    // Avoid duplicate notes_on_progress entries
    if (Array.isArray(updatePayload.notes_on_progress)) {
      updatePayload.notes_on_progress.forEach((item) => {
        const exists = idea.notes_on_progress.some(
          (n) =>
            n.note === item.note &&
            new Date(n.date).toISOString() === new Date(item.date).toISOString()
        );
        if (item.note && !exists) {
          idea.notes_on_progress.push({
            note: item.note,
            date: item.date || new Date(),
          });
        }
      });
    }

    // Append unique entries for source and sub_category
    ["source", "sub_category"].forEach((field) => {
      if (Array.isArray(updatePayload[field])) {
        const current = idea[field] || [];
        const newItems = updatePayload[field].filter(
          (item) => !current.includes(item)
        );
        idea[field] = [...current, ...newItems];
      }
    });

    // Analytics tracking
    idea.exploration_count += 1;
    idea.total_time_spent += Number(updatePayload.total_time_spent) || 0;
    idea.last_explored_at = updatePayload.last_explored_at
      ? new Date(updatePayload.last_explored_at)
      : new Date();

    await idea.save();

    res.status(200).json({
      message: "✅ Idea updated successfully",
      idea,
    });
  } catch (error) {
    console.error("❌ Error updating idea:", error);
    res
      .status(500)
      .json({ message: "Internal server error while updating idea" });
  }
};

exports.updateConvertToProjectField = async (req, res) => {
  try {
    const { id } = req.params;
    const { convert_to_project } = req.body;

    if (typeof convert_to_project !== "boolean") {
      return res
        .status(400)
        .json({ error: "convert_to_project must be a boolean." });
    }

    const updatedIdea = await Idea.findByIdAndUpdate(
      id,
      {
        convert_to_project,
        completion_status: convert_to_project ? "Completed" : "In Progress",
      },
      { new: true }
    );

    if (!updatedIdea) {
      return res.status(404).json({ error: "Idea not found." });
    }

    res.status(200).json(updatedIdea);
  } catch (err) {
    console.error("❌ Error updating convert_to_project field:", err);
    res
      .status(500)
      .json({ error: "Server error while updating convert_to_project." });
  }
};

exports.getIdeaById = async (req, res) => {
  try {
    const { id } = req.params;

    const idea = await Idea.findById(id);

    if (!idea) {
      return res.status(404).json({ error: "Idea not found." });
    }

    res.status(200).json(idea);
  } catch (err) {
    console.error("❌ Error fetching idea by ID:", err);
    res.status(500).json({ error: "Server error while fetching idea." });
  }
};

exports.getIdeasAnalytics = async (req, res) => {
  try {
    const ideas = await Idea.find();
    const totalIdeas = ideas.length;

    if (totalIdeas === 0) {
      return res.status(200).json({ message: "No ideas found", totalIdeas: 0 });
    }

    let totalTimeSpent = 0;
    let totalAttachments = 0;

    let maxTimeIdea = null;
    let minTimeIdea = null;

    let highRating = null;
    let lowRating = null;

    let maxExploration = null;

    const completionStatusCount = {};
    const importanceLevelCount = {};
    const curiosityLevelCount = {};

    let mostRiskIdea = null;
    let leastRiskIdea = null;
    let mostNotesIdea = null;
    let leastNotesIdea = null;

    // Collectors for averages
    let highImportanceCount = 0;
    let lowImportanceCount = 0;
    let highCuriosityCount = 0;
    let lowCuriosityCount = 0;

    let totalHighImportanceTime = 0;
    let totalLowImportanceTime = 0;
    let totalHighCuriosityTime = 0;
    let totalLowCuriosityTime = 0;

    let highRatingSum = 0;
    let lowRatingSum = 0;
    let highRatingCount = 0;
    let lowRatingCount = 0;

    ideas.forEach((idea) => {
      const timeSpent = idea.total_time_spent || 0;
      totalTimeSpent += timeSpent;

      // Max/min time spent
      if (!maxTimeIdea || timeSpent > maxTimeIdea.total_time_spent)
        maxTimeIdea = idea;
      if (!minTimeIdea || timeSpent < minTimeIdea.total_time_spent)
        minTimeIdea = idea;

      // Ratings
      if (idea.fun_rating !== null && idea.usefulness_rating !== null) {
        const avgRating = (idea.fun_rating + idea.usefulness_rating) / 2;

        if (!highRating || avgRating > highRating.rating) {
          highRating = { idea, rating: avgRating };
        }
        if (!lowRating || avgRating < lowRating.rating) {
          lowRating = { idea, rating: avgRating };
        }

        // Avg rating buckets
        if (avgRating >= 3) {
          highRatingSum += avgRating;
          highRatingCount++;
        } else {
          lowRatingSum += avgRating;
          lowRatingCount++;
        }
      }

      // Curiosity Level
      const curiosity = idea.curiosity_level;
      if (curiosity) {
        curiosityLevelCount[curiosity] =
          (curiosityLevelCount[curiosity] || 0) + 1;

        if (curiosity.toLowerCase() === "high") {
          totalHighCuriosityTime += timeSpent;
          highCuriosityCount++;
        } else if (curiosity.toLowerCase() === "low") {
          totalLowCuriosityTime += timeSpent;
          lowCuriosityCount++;
        }
      }

      // Exploration count
      if (
        !maxExploration ||
        idea.exploration_count > maxExploration.exploration_count
      ) {
        maxExploration = idea;
      }

      // Completion status
      const status = idea.completion_status || "Unknown";
      completionStatusCount[status] = (completionStatusCount[status] || 0) + 1;

      // Importance
      const importance = idea.importance_level;
      if (importance) {
        importanceLevelCount[importance] =
          (importanceLevelCount[importance] || 0) + 1;

        if (
          importance.toLowerCase() === "critical" ||
          importance.toLowerCase() === "high"
        ) {
          totalHighImportanceTime += timeSpent;
          highImportanceCount++;
        } else if (importance.toLowerCase() === "low") {
          totalLowImportanceTime += timeSpent;
          lowImportanceCount++;
        }
      }

      // Risks
      const risksCount = idea.risks_or_challenges?.length || 0;
      if (!mostRiskIdea || risksCount > mostRiskIdea.count)
        mostRiskIdea = { idea, count: risksCount };
      if (!leastRiskIdea || risksCount < leastRiskIdea.count)
        leastRiskIdea = { idea, count: risksCount };

      // Notes
      const notesCount = idea.notes_on_progress?.length || 0;
      if (!mostNotesIdea || notesCount > mostNotesIdea.count)
        mostNotesIdea = { idea, count: notesCount };
      if (!leastNotesIdea || notesCount < leastNotesIdea.count)
        leastNotesIdea = { idea, count: notesCount };

      // Attachments
      totalAttachments += idea.attached_files?.length || 0;
    });

    const averageTimeSpent = totalTimeSpent / totalIdeas;
    const averageAttachments = totalAttachments / totalIdeas;

    res.status(200).json({
      totalIdeas,
      averageTimeSpent: Number(averageTimeSpent.toFixed(2)),
      mostTimeSpent: {
        idea_title: maxTimeIdea.idea_title,
        total_time_spent: maxTimeIdea.total_time_spent,
        id: maxTimeIdea._id,
      },
      leastTimeSpent: {
        idea_title: minTimeIdea.idea_title,
        total_time_spent: minTimeIdea.total_time_spent,
        id: minTimeIdea._id,
      },
      highRating: highRating && {
        idea_title: highRating.idea.idea_title,
        rating: highRating.rating,
        id: highRating.idea._id,
      },
      lowRating: lowRating && {
        idea_title: lowRating.idea.idea_title,
        rating: lowRating.rating,
        id: lowRating.idea._id,
      },
      averageHighRating: highRatingCount
        ? Number((highRatingSum / highRatingCount).toFixed(2))
        : null,
      averageLowRating: lowRatingCount
        ? Number((lowRatingSum / lowRatingCount).toFixed(2))
        : null,
      curiosityLevelDistribution: curiosityLevelCount,
      averageHighCuriosityTime: highCuriosityCount
        ? Number((totalHighCuriosityTime / highCuriosityCount).toFixed(2))
        : null,
      averageLowCuriosityTime: lowCuriosityCount
        ? Number((totalLowCuriosityTime / lowCuriosityCount).toFixed(2))
        : null,
      highestExploration: {
        idea_title: maxExploration.idea_title,
        exploration_count: maxExploration.exploration_count,
        id: maxExploration._id,
      },
      completionStatusCount,
      importanceLevelCount,
      averageHighImportanceTime: highImportanceCount
        ? Number((totalHighImportanceTime / highImportanceCount).toFixed(2))
        : null,
      averageLowImportanceTime: lowImportanceCount
        ? Number((totalLowImportanceTime / lowImportanceCount).toFixed(2))
        : null,
      mostRiskIdea: {
        idea_title: mostRiskIdea.idea.idea_title,
        risks_count: mostRiskIdea.count,
        id: mostRiskIdea.idea._id,
      },
      leastRiskIdea: {
        idea_title: leastRiskIdea.idea.idea_title,
        risks_count: leastRiskIdea.count,
        id: leastRiskIdea.idea._id,
      },
      mostNotesIdea: {
        idea_title: mostNotesIdea.idea.idea_title,
        notes_count: mostNotesIdea.count,
        id: mostNotesIdea.idea._id,
      },
      leastNotesIdea: {
        idea_title: leastNotesIdea.idea.idea_title,
        notes_count: leastNotesIdea.count,
        id: leastNotesIdea.idea._id,
      },
      averageAttachments: Number(averageAttachments.toFixed(2)),
    });
  } catch (error) {
    console.error("❌ Error in analytics:", error);
    res.status(500).json({ error: "Server error while generating analytics." });
  }
};

exports.getSingleIdeaAnalytics = async (req, res) => {
  const { id } = req.params;

  try {
    const idea = await Idea.findById(id);
    if (!idea) {
      return res.status(404).json({ message: "Idea not found" });
    }

    const timeSpent = idea.total_time_spent || 0;
    const avgRating =
      idea.fun_rating !== null && idea.usefulness_rating !== null
        ? (idea.fun_rating + idea.usefulness_rating) / 2
        : null;

    const analytics = {
      idea_title: idea.idea_title,
      timeSpent,
      avgRating,
      curiosityLevel: idea.curiosity_level,
      explorationCount: idea.exploration_count,
      attachmentsCount: idea.attached_files?.length || 0,
      risksCount: idea.risks_or_challenges?.length || 0,
      notesCount: idea.notes_on_progress?.length || 0,
    };

    res.status(200).json({ success: true, analytics });
  } catch (err) {
    console.error("Error getting idea analytics:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// controllers/ideaAnalyticsController.js

exports.getAllIdeasAnalyticsAverages = async (req, res) => {
  try {
    const results = await Idea.aggregate([
      {
        $project: {
          timeSpent: { $ifNull: ["$total_time_spent", 0] },
          explorationCount: { $ifNull: ["$exploration_count", 0] },
          attachmentsCount: { $size: { $ifNull: ["$attached_files", []] } },
          risksCount: { $size: { $ifNull: ["$risks_or_challenges", []] } },
          notesCount: { $size: { $ifNull: ["$notes_on_progress", []] } },
          funRating: { $ifNull: ["$fun_rating", null] },
          usefulnessRating: { $ifNull: ["$usefulness_rating", null] },
          averageRating: {
            $cond: {
              if: {
                $and: [
                  { $ne: ["$fun_rating", null] },
                  { $ne: ["$usefulness_rating", null] },
                ],
              },
              then: {
                $divide: [{ $add: ["$fun_rating", "$usefulness_rating"] }, 2],
              },
              else: null,
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          avgTimeSpent: { $avg: "$timeSpent" },
          avgExplorationCount: { $avg: "$explorationCount" },
          avgAttachmentsCount: { $avg: "$attachmentsCount" },
          avgRisksCount: { $avg: "$risksCount" },
          avgNotesCount: { $avg: "$notesCount" },
          avgFunRating: { $avg: "$funRating" },
          avgUsefulnessRating: { $avg: "$usefulnessRating" },
          avgAverageRating: { $avg: "$averageRating" },
        },
      },
    ]);

    res.status(200).json(results[0] || {});
  } catch (error) {
    console.error("❌ Error fetching average analytics:", error);
    res.status(500).json({ error: "Server error while calculating averages." });
  }
};

exports.getAllIdeas = async (req, res) => {
  try {
    console.log("📥 Fetching all ideas from database...");

    const ideas = await Idea.find(
      {},
      {
        _id: 1,
        idea_title: 1,
        idea_description: 1,
        category: 1,
        sub_category: 1,
        curiosity_level: 1,
        priority_reason: 1,
        external_references: 1,
        importance_level: 1,
      }
    ).sort({ createdAt: -1 });

    console.log(`✅ ${ideas.length} ideas fetched successfully.`);

    res.status(200).json(ideas);
  } catch (error) {
    console.error("❌ Error fetching all ideas:", error);
    res.status(500).json({
      message: "Internal server error while fetching ideas",
      error: error.message,
    });
  }
};

// controllers/ideaController.js

exports.searchIdeasByTitle = async (req, res) => {
  const searchQuery = req.query.q;

  // 1. Check for empty or missing query
  if (!searchQuery || searchQuery.trim() === "") {
    console.warn("[SearchIdeas] Missing or empty query string.");
    return res.status(400).json({
      success: false,
      message: "Query string 'q' is required.",
    });
  }

  try {
    const regex = new RegExp(searchQuery, "i");

    const ideas = await Idea.find(
      { idea_title: { $regex: regex } },
      {
        _id: 1,
        idea_title: 1,
        idea_description: 1,
        category: 1,
        sub_category: 1,
      }
    )
      .collation({ locale: "en", strength: 2 })
      .lean();

    if (!ideas || ideas.length === 0) {
      console.info(`[SearchIdeas] No ideas found for query: '${searchQuery}'`);
      return res.status(404).json({
        success: false,
        message: "No ideas found.",
      });
    }

    console.log(
      `[SearchIdeas] Found ${ideas.length} idea(s) for query: '${searchQuery}'`
    );
    return res.status(200).json({
      success: true,
      ideas,
    });
  } catch (error) {
    console.error("[SearchIdeas] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while searching ideas.",
      error: error.message,
    });
  }
};
