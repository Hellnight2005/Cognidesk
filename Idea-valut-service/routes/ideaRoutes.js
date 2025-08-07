const express = require("express");
const router = express.Router();
const multer = require("multer");
const ideaController = require("../controllers/ideaController");

const uploadToDrive = require("../middlewares/uploadToDrive");

// In-memory file storage for idea uploads
const upload = multer({ storage: multer.memoryStorage() });

/**
 * ROUTES ORDER:
 * 1. Analytics / Utility First
 * 2. Non-ID Based Fetch
 * 3. Create / Search / Filter
 * 4. ID-based operations at the bottom
 */

// 🧠 Analytics (Should be before dynamic :id routes)
router.get("/analytics", ideaController.getIdeasAnalytics);
router.get("/analytics/averages", ideaController.getAllIdeasAnalyticsAverages); // ✅ FIXED
router.get("/:id/analytics", ideaController.getSingleIdeaAnalytics);

// // 🔍 Search and Listing
router.get("/", ideaController.getAllIdeas); // List all ideas
router.get("/search", ideaController.searchIdeasByTitle); // Filter/search ideas

// ➕ Create
router.post("/", upload.array("files"), ideaController.createIdea);

// 🔁 Update
router.put("/:id", ideaController.updateIdea);
router.put("/:id/convert", ideaController.updateConvertToProjectField);

// ❌ Delete
router.delete("/:id", ideaController.deleteIdea);

// 📄 Single Idea (KEEP LAST to avoid route collisions)
router.get("/:id", ideaController.getIdeaById);

module.exports = router;
