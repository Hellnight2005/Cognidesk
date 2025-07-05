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
