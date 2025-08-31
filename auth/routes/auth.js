const express = require("express");
const passport = require("passport");
const attachDeviceInfo = require("../middleware/attachDeviceInfo");
const router = express.Router();

// =======================
// 🔹 Google OAuth Routes
// =======================

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
    prompt: "consent",
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/auth/failure",
  }),
  attachDeviceInfo,
  (req, res) => {
    res.redirect("/auth/success");
  }
);

// =======================
// 🔹 GitHub OAuth Routes
// =======================

router.get(
  "/github",
  passport.authenticate("github", {
    scope: ["user:email", "repo"],
  })
);

router.get(
  "/github/callback",
  passport.authenticate("github", {
    failureRedirect: "/auth/failure",
  }),
  attachDeviceInfo,
  (req, res) => {
    res.redirect("/auth/success");
  }
);

// =======================
// 🔹 Shared Auth Routes
// =======================

router.get("/success", (req, res) => {
  if (!req.user || !req.session.passport?.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const sessionUser = req.session.passport.user;

  // 🧁 Set cookies using cookie-parser
  res.cookie(
    "profile",
    JSON.stringify({
      id: sessionUser.id,
      username: sessionUser.username,
      display_name: sessionUser.display_name,
      photo: sessionUser.profile_photo_url,
    }),
    {
      httpOnly: false,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "Lax",
    }
  );

  res.cookie("google", JSON.stringify(sessionUser.provider.google || {}), {
    httpOnly: false,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: "Lax",
  });

  res.cookie("github", JSON.stringify(sessionUser.provider.github || {}), {
    httpOnly: false,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: "Lax",
  });

  // ✅ Redirect to frontend after setting cookies
  res.redirect("http://localhost:5173");
});

router.get("/failure", (req, res) => {
  res.redirect("http://localhost:5173");
});

router.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.clearCookie("profile");
      res.clearCookie("google");
      res.clearCookie("github");
      res.redirect("/");
    });
  });
});

module.exports = router;
