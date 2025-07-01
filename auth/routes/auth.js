const express = require("express");
const passport = require("passport");
const router = express.Router();

// =======================
// 🔹 Google OAuth Routes
// =======================

// 🟢 Start Google Login
router.get(
  "/google",
  passport.authenticate("google", {
    scope: [
      "profile",
      "email",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    accessType: "offline",
    prompt: "consent", // ensures refreshToken is returned
  })
);

// 🔁 Google OAuth Callback
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/auth/failure",
    successRedirect: "/auth/success",
  })
);

// =======================
// 🔹 GitHub OAuth Routes
// =======================

// 🟢 Start GitHub Login with `repo` scope
router.get(
  "/github",
  passport.authenticate("github", {
    scope: ["user:email", "repo"], // `repo` gives access to private repo and file manipulation
  })
);

// 🔁 GitHub OAuth Callback
router.get(
  "/github/callback",
  passport.authenticate("github", {
    failureRedirect: "/auth/failure",
    successRedirect: "/auth/success",
  })
);

// =======================
// 🔹 Shared Auth Routes
// =======================

// ✅ OAuth Success
router.get("/success", (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  res.json({ message: "Login successful", user: req.user });
});

// ❌ OAuth Failure
router.get("/failure", (req, res) => {
  res.status(401).json({ message: "Login failed" });
});

// 🚪 Logout
router.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/");
  });
});

module.exports = router;
