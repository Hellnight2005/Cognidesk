const express = require("express");
const router = express.Router();
const {
  createRepo,
  fetchRepos,
  changeRepoVisibility,
  getSpecificRepoAnalysis,
  getAllRepoAnalysis,
  updateRepo,
  syncGithubRepoToDB,
  retireProject,
  addRepoToProject,
  getAllProjects,
} = require("../controllers/activeProject");

router.get("/", getAllProjects);
// // 2. Get a specific repo by name
router.post("/repos", fetchRepos); // Assuming fetchAllRepos is defined in activeProjectController

// // 3. Create a repo
router.post("/repos", createRepo);

// // 6. Change repo visibility (public/private)
router.patch("/repos/visibility", changeRepoVisibility);

// // 7. Get analysis of all repos
router.get("/analysis/all", getAllRepoAnalysis);

// // 8. Get analysis of a specific repo
router.get("/analysis", getSpecificRepoAnalysis);

router.post("/sync-github-repo", syncGithubRepoToDB);

// // 4. Update a repo by ID or name
router.post("/update-repo", updateRepo); // identifier = ID or name

router.post("/repo/:id", retireProject);

router.put("/repo/:id", addRepoToProject); // Assuming retireProject is defined in activeProjectController

module.exports = router;
