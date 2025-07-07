const express = require("express");
const router = express.Router();
const multer = require("multer");
const ideaController = require("../controllers/ideaController");

const upload = multer({ storage: multer.memoryStorage() });

const uploadToDrive = require("../middlewares/uploadToDrive");

router.post(
  "/",
  upload.array("files"), // Files in form-data
  uploadToDrive, // Adds attached_files[]
  ideaController.createIdea
);

// Basic CRUD
router.get("/", ideaController.getAllIdeas);
router.get("/:id", ideaController.getIdeaById);
router.put("/:id", ideaController.updateIdea);
router.delete("/:id", ideaController.deleteIdea);

// Analytics
router.get("/:id/summary", ideaController.getIdeaSummary);

module.exports = router;
