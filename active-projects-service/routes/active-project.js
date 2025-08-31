const express = require("express");
const router = express.Router();
const {
  createGithubRepo,
  createProjectEntry,
  fetchRepos,
  changeRepoVisibility,
  getSpecificRepoAnalysis,
  getAllRepoAnalysis,
  updateProject,
  syncGithubRepoToDB,
  retireProject,
  addRepoToProject,
  getAllProjects,
  getProjectById,
  deleteProject,
} = require("../controllers/activeProject");

// Fetch a list of user's GitHub repos that can be imported.
router.get("/repos", fetchRepos);

// Create a new project and GitHub repo.
router.post("/repos", createGithubRepo);

// Change the visibility (public/private) of a linked GitHub repo.
router.patch("/repos/visibility", changeRepoVisibility);

// Sync GitHub repo data (commits, languages, etc.) to the database.
router.post("/repos/sync", syncGithubRepoToDB);

// Get analysis of a specific repo.
router.get("/analysis", getSpecificRepoAnalysis);

// Get analysis of all repos.
router.get("/analysis/all", getAllRepoAnalysis);

// Get all projects.
router.get("/", getAllProjects);

// Create a new project entry in the database.
router.post("/", createProjectEntry);

// Get a specific project by ID.
router.get("/:id", getProjectById);

// Add an existing GitHub repo to a project.
router.put("/:id/repos", addRepoToProject);

// Update a project's priority or status.
router.put("/repo/updated", updateProject);

// Retire a project (e.g., set status to "Completed").
router.patch("/:id/retire", retireProject);

// the route to delet the project
router.delete("/repo", deleteProject);

module.exports = router;
