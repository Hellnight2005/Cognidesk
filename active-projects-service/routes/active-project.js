const express = require("express");
const router = express.Router();
const { createRepo, fetchRepos } = require("../controllers/activeProject");

// // 1. Get all repos
router.get("/repos", fetchRepos); // Assuming fetchAllRepos is defined in activeProjectController

// // 2. Get a specific repo by name
// router.get("/repos/:name", activeProjectController.getRepoByName);

// // 3. Create a repo
router.post("/repos", createRepo);

// // 4. Update a repo by ID or name
// router.put("/repos/:identifier", activeProjectController.updateRepo); // identifier = ID or name

// // 5. Delete a repo by ID or name
// router.delete("/repos/:identifier", activeProjectController.deleteRepo);

// // 6. Change repo visibility (public/private)
// router.patch(
//   "/repos/:identifier/visibility",
//   activeProjectController.changeRepoVisibility
// );

// // 7. Get analysis of all repos
// router.get("/analysis", activeProjectController.getAllRepoAnalysis);

// // 8. Get analysis of a specific repo
// router.get("/analysis/:name", activeProjectController.getRepoAnalysisByName);

// // 9. Get most active repos
// router.get("/repos/most-active", activeProjectController.getMostActiveRepos);

module.exports = router;
