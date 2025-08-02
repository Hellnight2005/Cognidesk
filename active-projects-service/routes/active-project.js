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
} = require("../controllers/activeProject");

// // 2. Get a specific repo by name
router.get("/repos", fetchRepos); // Assuming fetchAllRepos is defined in activeProjectController

// // 3. Create a repo
router.post("/repos", createRepo);

// // 6. Change repo visibility (public/private)
router.patch("/repos/visibility", changeRepoVisibility);

// // 7. Get analysis of all repos
router.get("/analysis", getAllRepoAnalysis);

// // 8. Get analysis of a specific repo
router.get("/analysis", getSpecificRepoAnalysis);

// // 9. Get most active repos
// router.get("/repos/most-active", activeProjectController.getMostActiveRepos);
router.post("/sync-github-repo", syncGithubRepoToDB);
// // 4. Update a repo by ID or name
router.post("/update-repo", updateRepo); // identifier = ID or name
module.exports = router;
