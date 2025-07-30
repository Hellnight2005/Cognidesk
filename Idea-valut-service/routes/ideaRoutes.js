const express = require("express");
const router = express.Router();
const multer = require("multer");
const ideaController = require("../controllers/ideaController");

const upload = multer({ storage: multer.memoryStorage() });

const uploadToDrive = require("../middlewares/uploadToDrive");

router.post("/", upload.array("files"), ideaController.createIdea);

router.delete("/:id", ideaController.deleteIdea);
router.put("/:id", ideaController.updateIdea);
router.put("/:id/convert", ideaController.updateConvertToProjectField);

// 🧠 Move these BEFORE "/:id"
router.get("/analytics", ideaController.getIdeasAnalytics);
router.get("/:id/analytics", ideaController.getAllIdeasAnalyticsAverages);

// 🚨 Always keep this one last
router.get("/:id", ideaController.getIdeaById);

module.exports = router;
