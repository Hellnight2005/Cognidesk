const mongoose = require("mongoose");
const sharedModels = require("../../shared-models");

// ⚠️ sharedModels.UserSchema is just a schema — so create a model from it
const User = mongoose.model("User", sharedModels.UserSchema); // create local model

const axios = require("axios");

exports.fetchAllUsers = () => {
  return User.find({}, "profile.username profile.email");
};

exports.fetchUserById = (id) => {
  return User.findById(id);
};

exports.getUserSettings = (id) => {
  return User.findById(id).select("settings");
};

exports.getUserAnalytics = (id) => {
  return User.findById(id).select("analytics");
};

// 🔁 Refresh Google Token

exports.refreshGoogleAccessToken = async (userId) => {
  const user = await User.findById(userId);
  const refreshToken = user?.auth?.providers?.google?.refresh_token;

  if (!refreshToken) {
    throw new Error("No Google refresh token found.");
  }

  try {
    const res = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token, expires_in } = res.data;
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

    // ✅ Update token info in DB
    user.auth.providers.google.access_token = access_token;
    user.auth.providers.google.token_expires_at = tokenExpiresAt;

    await user.save();

    return {
      access_token,
      expires_at: tokenExpiresAt,
    };
  } catch (err) {
    console.error(
      "❌ Failed to refresh Google access token:",
      err.response?.data || err.message
    );
    throw new Error("Failed to refresh Google access token");
  }
};

// 🔁 Revoke GitHub Token
exports.revokeGitHubToken = async (userId) => {
  const user = await User.findById(userId);
  const token = user?.auth?.providers?.github?.access_token;
  if (!token) throw new Error("No GitHub token found");

  // Revoke using GitHub API — requires Basic Auth
  const result = await axios.delete(
    `https://api.github.com/applications/${process.env.GITHUB_CLIENT_ID}/token`,
    {
      auth: {
        username: process.env.GITHUB_CLIENT_ID,
        password: process.env.GITHUB_CLIENT_SECRET,
      },
      data: { access_token: token },
    }
  );

  // Optional: Clear token in DB
  user.auth.providers.github.access_token = null;
  user.auth.providers.github.token_expires_at = null;
  await user.save();

  return result.data || { status: "revoked" };
};
