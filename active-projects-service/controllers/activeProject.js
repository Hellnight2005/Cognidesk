const mongoose = require("mongoose");
const sharedModels = require("../../shared-models");
const ActiveProject = mongoose.model(
  "ActiveProject",
  sharedModels.ActiveProjectSchema
);
const {
  getUserById,
  addActiveProjectToUser,
} = require("../services/user-services");
const { Octokit } = require("@octokit/rest");

async function createRepo(req, res) {
  const {
    name,
    goal,
    description,
    deadline,
    tags = [],
    created_by_user_id,
    collaborators = [],
    is_private = false,
    origin_idea = null,
  } = req.body;

  if (!name || !created_by_user_id) {
    return res.status(400).json({ message: "Name and user ID are required" });
  }

  try {
    const user = await getUserById(created_by_user_id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const githubToken = user.auth?.providers?.github?.access_token;
    if (!githubToken)
      return res.status(403).json({ message: "GitHub access token missing" });

    const octokit = new Octokit({ auth: githubToken });
    const repoDescription = description || `Project repo for: ${name}`;

    // 1. Create GitHub repo
    const githubRes = await octokit.repos.createForAuthenticatedUser({
      name,
      description: repoDescription,
      private: is_private,
      auto_init: true,
    });

    const repo = githubRes.data;
    const repoCreatedDate = new Date(repo.created_at);

    // 2. Add collaborators
    for (const collab of collaborators) {
      if (collab.username && collab.role) {
        await octokit.repos.addCollaborator({
          owner: repo.owner.login,
          repo: repo.name,
          username: collab.username,
          permission: collab.role === "admin" ? "admin" : collab.role,
        });
      }
    }

    // 3. Fetch repo topics
    const topicsRes = await octokit.repos.getAllTopics({
      owner: repo.owner.login,
      repo: repo.name,
    });

    // 4. Calculate fallback deadline
    const resolvedDeadline = deadline
      ? new Date(deadline)
      : new Date(repoCreatedDate.getTime() + 90 * 24 * 60 * 60 * 1000); // +90 days

    // 5. Save ActiveProject
    const project = await ActiveProject.create({
      name,
      goal,
      description: repoDescription,
      status: "Planning",
      start_date: repoCreatedDate,
      deadline: resolvedDeadline,
      tags,
      created_by_user_id,
      origin_idea,
      code_repositories: [
        {
          github_repo_id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          html_url: repo.html_url,
          clone_url: repo.clone_url,
          visibility: repo.visibility,
          default_branch: repo.default_branch,
          created_at: new Date(repo.created_at),
          updated_at: new Date(repo.updated_at),
          has_issues: repo.has_issues,
          has_projects: repo.has_projects,
          open_issues_count: repo.open_issues_count,
          forks_count: repo.forks_count,
          watchers_count: repo.watchers_count,
          stargazers_count: repo.stargazers_count,
          open_issues: repo.open_issues,
          watchers: repo.watchers,
          deployments_url: repo.deployments_url,
          topics: topicsRes.data.names || [],
          collaborators, // assume you're passing collaborator schema-compatible data
        },
      ],
    });

    // 6. Link project to user
    await addActiveProjectToUser({
      userId: created_by_user_id,
      projectId: project._id,
    });

    return res.status(201).json({
      message: "Repo and project created successfully",
      project,
    });
  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.status(500).json({
      message: "Failed to create GitHub repo or save project",
      error: err.message,
    });
  }
}

module.exports = {
  createRepo,
};
