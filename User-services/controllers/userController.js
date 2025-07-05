const userService = require("../services/userService");

exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await userService.fetchAllUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
};

exports.getUserById = async (req, res, next) => {
  try {
    const user = await userService.fetchUserById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

exports.getUserSettings = async (req, res, next) => {
  try {
    const settings = await userService.getUserSettings(req.params.id);
    res.json(settings);
  } catch (err) {
    next(err);
  }
};

exports.getUserAnalytics = async (req, res, next) => {
  try {
    const analytics = await userService.getUserAnalytics(req.params.id);
    res.json(analytics);
  } catch (err) {
    next(err);
  }
};

// 🔁 Revoke Google

exports.refreshGoogleToken = async (req, res, next) => {
  try {
    const result = await userService.refreshGoogleAccessToken(req.params.id);
    res.json({ message: "Google token refreshed", result });
  } catch (err) {
    next(err);
  }
};
