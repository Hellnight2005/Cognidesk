// services/userService.js
const mongoose = require("mongoose");
const sharedModels = require("../../shared-models");
const User = mongoose.model("User", sharedModels.UserSchema); // ✅ model created from shared schema

async function getUserById(userId) {
  try {
    const user = await User.findById(userId);
    return user;
  } catch (err) {
    console.error("Error fetching user:", err);
    return null;
  }
}

// async function addActiveProjectToUser({ userId, projectId }) {
//   if (!userId || !projectId) throw new Error("Missing userId or projectId");

//   await User.updateOne(
//     { _id: userId },
//     {
//       $addToSet: {
//         "knowledge.active_projects": projectId,
//       },
//       $set: {
//         "meta.updatedAt": new Date(),
//       },
//     }
//   );
// }

module.exports = {
  getUserById,
  // addActiveProjectToUser,
};
