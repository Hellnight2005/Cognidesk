const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

// Basic
router.get("/", userController.getAllUsers);
router.get("/:id", userController.getUserById);

// Settings & Analytics
router.get("/:id/settings", userController.getUserSettings);
router.get("/:id/analytics", userController.getUserAnalytics);

// 🔁 Token Revoke
router.get("/:id/revoke/google", userController.refreshGoogleToken);

module.exports = router;
