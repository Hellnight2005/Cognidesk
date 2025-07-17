// shared-models/index.js
module.exports = {
  UserSchema: require("./models/User"),
  ActiveProjectSchema: require("./models/ActiveProject"),
  IdeaSchema: require("./models/Idea"),
};

// const sharedModels = require("../../shared-models");
// const Idea =
//   mongoose.models.Idea || mongoose.model("Idea", sharedModels.IdeaSchema);
