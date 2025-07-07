const ideaService = require("../services/ideaService");

exports.getAllIdeas = async (req, res, next) => {
  try {
    const ideas = await ideaService.fetchAllIdeas();
    res.json(ideas);
  } catch (err) {
    next(err);
  }
};

exports.getIdeaById = async (req, res, next) => {
  try {
    const idea = await ideaService.fetchIdeaById(req.params.id);
    if (!idea) return res.status(404).json({ message: "Idea not found" });
    res.json(idea);
  } catch (err) {
    next(err);
  }
};

exports.createIdea = async (req, res, next) => {
  try {
    const idea = await ideaService.createIdea(req.body);
    res.status(201).json(idea);
  } catch (err) {
    next(err);
  }
};

exports.updateIdea = async (req, res, next) => {
  try {
    const idea = await ideaService.updateIdea(req.params.id, req.body);
    if (!idea) return res.status(404).json({ message: "Idea not found" });
    res.json(idea);
  } catch (err) {
    next(err);
  }
};

exports.deleteIdea = async (req, res, next) => {
  try {
    const result = await ideaService.deleteIdea(req.params.id);
    if (!result) return res.status(404).json({ message: "Idea not found" });
    res.json({ message: "Idea deleted" });
  } catch (err) {
    next(err);
  }
};

exports.getIdeaSummary = async (req, res, next) => {
  try {
    const summary = await ideaService.getIdeaSummary(req.params.id);
    res.json(summary);
  } catch (err) {
    next(err);
  }
};
