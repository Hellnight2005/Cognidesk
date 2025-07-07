const mongoose = require("mongoose");
const sharedModels = require("../../shared-models");

// ⚠️ sharedModels.UserSchema is just a schema — so create a model from it
const Idea = mongoose.model("Idea", sharedModels.IdeaSchema);

exports.fetchAllIdeas = () => {
  return Idea.find({}, "idea_title category curiosity_level completion_status");
};

exports.fetchIdeaById = (id) => {
  return Idea.findById(id);
};

exports.createIdea = (data) => {
  const idea = new Idea(data);
  return idea.save();
};

exports.updateIdea = (id, data) => {
  return Idea.findByIdAndUpdate(id, data, { new: true });
};

exports.deleteIdea = (id) => {
  return Idea.findByIdAndDelete(id);
};

exports.getIdeaSummary = async (id) => {
  const idea = await Idea.findById(id).select(
    "idea_title exploration_count total_time_spent importance_level"
  );
  if (!idea) throw new Error("Idea not found");
  return {
    title: idea.idea_title,
    exploration_count: idea.exploration_count,
    total_time_spent: idea.total_time_spent,
    importance: idea.importance_level,
  };
};
