const mongoose = require("mongoose");
const axios = require("axios");
const sharedModels = require("../../shared-models");
const { calculateRepoStats } = require("../utils/repoStats");
const ActiveProject = mongoose.model(
  "ActiveProject",
  sharedModels.ActiveProjectSchema
);

const {
  getUserById,
  addActiveProjectToUser,
  removeActiveProjectFromUser,
} = require("../services/user-services");
const { Octokit } = require("@octokit/rest");

async function getAllProjects(req, res) {
  try {
    const projects = await ActiveProject.find({}).lean();

    if (!projects || projects.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No projects found." });
    }

    const transformedProjects = projects.map((project) => {
      const {
        _id,
        created_by_user_id,
        origin_idea,
        title,
        description,
        start_date,
        code_repositories,
        github_stats_summary,
        priority,
        status,
      } = project;

      const formattedRepos = {};
      if (Array.isArray(code_repositories)) {
        code_repositories.forEach((repo) => {
          if (repo.repo_name && repo.repo_url) {
            formattedRepos[repo.repo_name] = repo.repo_url;
          }
        });
      }

      return {
        _id,
        created_by_user_id,
        origin_idea,
        title,
        description,
        start_date,
        code_repositories: formattedRepos,
        github_stats_summary,
        priority,
        status,
      };
    });

    res.status(200).json({ success: true, projects: transformedProjects });
  } catch (error) {
    console.error("Error fetching projects:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch projects." });
  }
}

// done
// --- Controller: create GitHub repository only ---
async function createGithubRepo(req, res) {
  const {
    title,
    description,
    created_by_user_id,
    collaborators = [],
    is_private = false,
  } = req.body;

  if (!title || !created_by_user_id) {
    return res.status(400).json({ message: "title and user ID are required" });
  }

  try {
    const user = await getUserById(created_by_user_id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const githubToken = user.auth?.providers?.github?.access_token;
    if (!githubToken) {
      return res.status(403).json({ message: "GitHub access token missing" });
    }

    const octokit = new Octokit({ auth: githubToken });
    const repoDescription = description || `Project repo for: ${title}`;

    // 1. Create GitHub repo
    const githubRes = await octokit.repos.createForAuthenticatedUser({
      name: title,
      description: repoDescription,
      private: is_private,
      auto_init: true,
    });

    const repo = githubRes.data;

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

    return res.status(201).json({
      message: "GitHub repo created successfully",
      repo,
    });
  } catch (err) {
    console.error("❌ GitHub Repo Error:", err.message);
    return res.status(500).json({
      message: "Failed to create GitHub repo",
      error: err.message,
    });
  }
}

// --- Controller: create DB project entry only ---
async function createProjectEntry(req, res) {
  const {
    created_by_user_id,
    origin_idea,
    title,
    description,
    deadline,
    priority = "Medium",
    repoData = null, // 👈 default to null if not provided
  } = req.body;

  if (!title || !created_by_user_id) {
    return res.status(400).json({ message: "title and user ID are required" });
  }

  try {
    let projectData = {
      created_by_user_id,
      origin_idea,
      title,
      description,
      start_date: new Date(),
      deadline: deadline
        ? new Date(deadline)
        : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      status: "Planning",
      priority,
      code_repositories: [],
      github_stats_summary: {},
    };

    if (repoData) {
      const {
        repo,
        repoName,
        repoCreatedDate,
        mostUsedLanguage,
        allLanguages,
        branches,
        last_commits,
      } = repoData;

      const resolvedDeadline = deadline
        ? new Date(deadline)
        : new Date(repoCreatedDate.getTime() + 90 * 24 * 60 * 60 * 1000);

      projectData = {
        ...projectData,
        description: description || repo.description,
        start_date: repoCreatedDate,
        deadline: resolvedDeadline,
        code_repositories: [
          {
            repo_id: repo.id,
            repo_name: repoName,
            repo_url: repo.html_url,
            description: description || repo.description,
            primary_language: mostUsedLanguage,
            languages: allLanguages,
            branches,
            github_stats: {
              stars: repo.stargazers_count || 0,
              forks: repo.forks_count || 0,
              watchers: repo.watchers_count || 0,
              open_issues: repo.open_issues_count || 0,
              total_commits: last_commits.length,
              last_commit_date: last_commits[0]?.committed_at || null,
              last_commits,
              exploration_count: 0,
              progress_percent: 0,
            },
          },
        ],
        github_stats_summary: {
          total_repos: 1,
          average_commits: last_commits.length,
          average_stars: repo.stargazers_count || 0,
          average_forks: repo.forks_count || 0,
          average_watchers: repo.watchers_count || 0,
          average_issues: repo.open_issues_count || 0,
          most_used_language: mostUsedLanguage,
          all_languages: allLanguages,
        },
      };
    }

    const project = await ActiveProject.create(projectData);

    await addActiveProjectToUser({
      userId: created_by_user_id,
      projectId: project._id,
    });

    return res.status(201).json({
      message: "Project entry created successfully",
      project,
    });
  } catch (err) {
    console.error("❌ Project DB Error:", err.message);
    return res.status(500).json({
      message: "Failed to create project entry",
      error: err.message,
    });
  }
}

// get the project buy ID
async function getProjectById(req, res) {
  const { id } = req.params;

  try {
    const project = await ActiveProject.findById(id).lean();

    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found." });
    }

    // Optional: remove Mongoose internal fields like __v
    const { __v, ...projectData } = project;

    res.status(200).json({ success: true, project: projectData });
  } catch (error) {
    console.error("Error fetching project by ID:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch project." });
  }
}

// done
async function fetchRepos(req, res) {
  // Only read from query params
  const userId = req.query.userId;
  const search = req.query.search?.toLowerCase() || "";

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  const user = await getUserById(userId);

  if (!user || !user.auth?.providers?.github?.access_token) {
    return res.status(401).json({ error: "GitHub token missing" });
  }

  const token = user.auth.providers.github.access_token;
  const octokit = new Octokit({ auth: token });

  try {
    // Fetch up to 100 user repos, sorted by updated time
    const { data: repos } = await octokit.request("GET /user/repos", {
      per_page: 100,
      sort: "updated",
    });

    // Filter repos by search term in name or description
    const filtered = repos.filter(
      (repo) =>
        repo.name.toLowerCase().includes(search) ||
        (repo.description?.toLowerCase().includes(search) ?? false)
    );

    // Get list of all repo_ids already in ActiveProject
    const existing = await ActiveProject.find({
      "code_repositories.repo_id": { $in: filtered.map((r) => r.id) },
    });

    const existingRepoIds = new Set(
      existing.flatMap((project) =>
        project.code_repositories.map((r) => r.repo_id)
      )
    );

    // Format final output for UI
    const result = filtered.map((repo) => ({
      repo_id: repo.id,
      repo_name: repo.name,
      full_name: repo.full_name,
      repo_url: repo.html_url,
      description: repo.description || "",
      primary_language: repo.language || "Unknown",
      isAlreadyInDB: existingRepoIds.has(repo.id),
    }));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching repos:", error);
    return res.status(500).json({ error: "GitHub fetch failed" });
  }
}

// done
async function changeRepoVisibility(req, res) {
  const { userId, repo_id, make_private } = req.body;

  if (!userId || repo_id == null || make_private == null) {
    return res.status(400).json({
      message: "Missing userId, repo_id, or make_private flag",
    });
  }

  try {
    const user = await getUserById(userId);
    if (!user || !user.auth?.providers?.github?.access_token) {
      return res.status(403).json({ message: "GitHub access token missing" });
    }

    const githubToken = user.auth.providers.github.access_token;
    const octokit = new Octokit({ auth: githubToken });

    // Step 1: Find the repo entry
    const project = await ActiveProject.findOne({
      "code_repositories.repo_id": repo_id,
    });

    if (!project) {
      return res.status(404).json({ message: "Repo not found in DB" });
    }

    const repoInfo = project.code_repositories.find(
      (r) => r.repo_id === repo_id
    );

    if (!repoInfo) {
      return res.status(404).json({ message: "Repo info missing" });
    }

    const [owner, repo] = repoInfo.repo_url
      .replace("https://github.com/", "")
      .split("/");

    // Step 2: Check current visibility
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    const currentVisibility = repoData.private ? "private" : "public";
    const targetVisibility = make_private ? "private" : "public";

    if (currentVisibility === targetVisibility) {
      return res.status(400).json({
        message: `Repo already ${currentVisibility}. No update needed.`,
      });
    }

    // Step 3: Update on GitHub
    await octokit.repos.update({
      owner,
      repo,
      private: make_private,
    });

    // Step 4: Update in MongoDB
    await ActiveProject.updateOne(
      { "code_repositories.repo_id": repo_id },
      {
        $set: {
          "code_repositories.$.visibility": targetVisibility,
        },
      }
    );

    return res.status(200).json({
      message: `Repository visibility updated to ${targetVisibility}`,
    });
  } catch (err) {
    console.error("❌ Error changing visibility:", err);
    return res.status(500).json({
      message: "Failed to update repository visibility",
      error: err.message,
    });
  }
}
// done
async function getSpecificRepoAnalysis(req, res) {
  const { userId, githubRepoId } = req.query;

  if (!userId || !githubRepoId) {
    return res
      .status(400)
      .json({ error: "userId and githubRepoId are required." });
  }

  try {
    const project = await ActiveProject.findOne({
      created_by_user_id: userId,
      "code_repositories.repo_id": parseInt(githubRepoId),
    });

    if (!project) {
      return res
        .status(404)
        .json({ error: "Repository not found for this user." });
    }

    const repo = project.code_repositories.find(
      (r) => r.repo_id === parseInt(githubRepoId)
    );

    if (!repo) {
      return res
        .status(404)
        .json({ error: "Specific repo not found in project." });
    }

    return res.json({
      // Specific repo info
      repo_id: repo.repo_id,
      repo_name: repo.repo_name,
      repo_url: repo.repo_url,
      description: repo.description,
      branches: repo.branches,
      primary_language: repo.primary_language,
      languages: repo.languages,
      stats: repo.github_stats || {},

      // Project-wide info
      project_title: project.title,
      project_status: project.status,
      priority: project.priority,
      deadline: project.deadline,
      tags: project.tags || [],
    });
  } catch (error) {
    console.error("Error in getSpecificRepoAnalysis:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
}

// done
async function getAllRepoAnalysis(req, res) {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    const projects = await ActiveProject.find({ created_by_user_id: userId });

    if (!projects || projects.length === 0) {
      return res
        .status(404)
        .json({ error: "No projects found for this user." });
    }

    // Collect all repos
    const allRepos = [];
    projects.forEach((project) => {
      project.code_repositories.forEach((repo) => {
        const stats = repo.github_stats || {};
        allRepos.push({
          total_commits: stats.total_commits || 0,
          stars: stats.stars || 0,
          forks: stats.forks || 0,
          watchers: stats.watchers || 0,
          open_issues: stats.open_issues || 0,
        });
      });
    });

    const total_repositories = allRepos.length;

    // Sum all stats
    const total_stats = allRepos.reduce(
      (acc, repo) => {
        acc.total_commits += repo.total_commits;
        acc.stars += repo.stars;
        acc.forks += repo.forks;
        acc.watchers += repo.watchers;
        acc.open_issues += repo.open_issues;
        return acc;
      },
      { total_commits: 0, stars: 0, forks: 0, watchers: 0, open_issues: 0 }
    );

    // Compute averages (rounded to 2 decimals)
    const average_stats = {
      total_commits: total_repositories
        ? Number((total_stats.total_commits / total_repositories).toFixed(2))
        : 0,
      stars: total_repositories
        ? Number((total_stats.stars / total_repositories).toFixed(2))
        : 0,
      forks: total_repositories
        ? Number((total_stats.forks / total_repositories).toFixed(2))
        : 0,
      watchers: total_repositories
        ? Number((total_stats.watchers / total_repositories).toFixed(2))
        : 0,
      open_issues: total_repositories
        ? Number((total_stats.open_issues / total_repositories).toFixed(2))
        : 0,
    };

    return res.json({
      total_repositories,
      total_stats,
      average_stats,
    });
  } catch (error) {
    console.error("Error in getAllRepoAnalysis:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
}

// Done
async function updateProject(req, res) {
  const { userId, projectId, priority, status, deadline, description } =
    req.body;

  if (!userId || !projectId) {
    return res
      .status(400)
      .json({ error: "userId and projectId are required." });
  }

  try {
    const project = await ActiveProject.findOne({
      _id: projectId,
      created_by_user_id: userId,
    });

    if (!project) {
      return res
        .status(404)
        .json({ error: "Project not found or not owned by the user." });
    }

    // Update fields only if they are provided in the request body
    if (priority !== undefined) {
      project.priority = priority;
    }
    if (status !== undefined) {
      project.status = status;
    }
    if (deadline !== undefined) {
      project.deadline = deadline;
    }
    if (description !== undefined) {
      project.description = description;
    }

    // Save the updated project document
    await project.save();

    return res.status(200).json({
      message: "Project updated successfully.",
      updated: {
        priority: project.priority,
        status: project.status,
        deadline: project.deadline,
        description: project.description,
      },
    });
  } catch (error) {
    console.error("Update Project Error:", error);
    return res.status(500).json({ error: "Server error." });
  }
}

// done
async function syncGithubRepoToDB(req, res) {
  const { userId, repoId } = req.body;

  try {
    const user = await getUserById(userId);
    const accessToken = user?.auth?.providers?.github?.access_token;
    if (!accessToken) {
      return res.status(403).json({ error: "No GitHub access token" });
    }

    const project = await ActiveProject.findOne({
      "code_repositories.repo_id": repoId,
      created_by_user_id: userId,
    });

    if (!project) {
      return res
        .status(404)
        .json({ error: "Project not found or unauthorized" });
    }

    const repoInfo = project.code_repositories.find(
      (r) => r.repo_id === repoId
    );
    if (!repoInfo || !repoInfo.repo_url) {
      return res.status(400).json({ error: "Repo info missing" });
    }

    const [owner, repo] = repoInfo.repo_url
      .replace("https://github.com/", "")
      .split("/");
    const octokit = new Octokit({ auth: accessToken });

    // Fetch metadata, commits, collaborators, languages
    const [repoRes, commitsRes, languagesRes] = await Promise.all([
      octokit.rest.repos.get({ owner, repo }),
      octokit.rest.repos.listCommits({ owner, repo, per_page: 2 }),
      octokit.rest.repos.listLanguages({ owner, repo }),
    ]);

    const updatedRepo = repoRes.data;
    const commits = commitsRes.data || [];

    // Format last_commits to match new model
    const formattedCommits = commits.map((c) => ({
      message: c.commit.message,
      url: c.html_url,
      date: c.commit.author?.date ? new Date(c.commit.author.date) : null,
      author: c.commit.author?.name || null,
    }));

    // Count total commits using pagination
    const commitsCountRes = await octokit.request(
      "GET /repos/{owner}/{repo}/commits",
      {
        owner,
        repo,
        per_page: 1,
      }
    );

    let totalCommits = 1;
    const linkHeader = commitsCountRes.headers.link;
    if (linkHeader) {
      const match = linkHeader.match(/&page=(\d+)>; rel="last"/);
      if (match) {
        totalCommits = parseInt(match[1], 10);
      }
    }

    // Extract branches
    const branchesRes = await octokit.rest.repos.listBranches({ owner, repo });
    const branches = branchesRes.data.map((b) => b.name);

    // Assign updated info to the repo object inside the project
    Object.assign(repoInfo, {
      repo_name: updatedRepo.name,
      repo_url: updatedRepo.html_url,
      description: updatedRepo.description,
      branches,
      primary_language: updatedRepo.language || "Unknown",
      languages: new Map(Object.entries(languagesRes.data || {})),
      github_stats: {
        total_commits: totalCommits,
        last_commit_date: formattedCommits[0]?.date || null,
        last_commits: formattedCommits,
        stars: updatedRepo.stargazers_count,
        forks: updatedRepo.forks_count,
        watchers: updatedRepo.subscribers_count,
        open_issues: updatedRepo.open_issues_count,
        exploration_count: repoInfo.github_stats?.exploration_count || 0,
        progress_percent: repoInfo.github_stats?.progress_percent || 0,
      },
    });

    await project.save();

    return res.status(200).json({
      message: "Repository and commits synced successfully.",
      repo: repoInfo,
      last_commits: formattedCommits,
      github_stats: repoInfo.github_stats,
    });
  } catch (error) {
    console.error("GitHub sync failed:", error);
    return res.status(500).json({ error: "Failed to sync GitHub repository." });
  }
}

// When a project is marked as "Completed", the associated idea is automatically converted into a project.

async function retireProject(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = [
    "Planning",
    "In Progress",
    "Review",
    "Completed",
    "Paused",
  ];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Use one of: ${validStatuses.join(", ")}.`,
    });
  }

  try {
    const updated = await ActiveProject.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Project not found" });
    }

    // 🔁 Trigger idea conversion if Completed and origin_idea exists
    if (status === "Completed" && updated.origin_idea) {
      const ideaServiceURL =
        process.env.IDEA_SERVICE_URL || "http://localhost:3002";
      const convertURL = `${ideaServiceURL}/api/ideas/${updated.origin_idea}/convert`;

      try {
        await axios.put(convertURL, {
          convert_to_project: true,
        });
        console.log("Triggered idea conversion for:", updated.origin_idea);
      } catch (conversionErr) {
        console.warn("Failed to convert idea:", conversionErr.message);
        // You can choose whether to fail the whole request or not
      }
    }

    return res.json({
      message: `Project status updated to '${status}'`,
      project: updated,
    });
  } catch (err) {
    console.error("Error updating project status:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// delete the project
const deleteProject = async (req, res) => {
  const { userId, projectId } = req.body;

  // 1. Validate that userId and projectId are provided
  if (!userId || !projectId) {
    return res
      .status(400)
      .json({ error: "userId and projectId are required." });
  }

  try {
    // 2. Remove the project from the user's active projects list
    await removeActiveProjectFromUser({ userId, projectId });

    // 3. Delete the project document from the ActiveProject collection
    const projectDeleteResult = await ActiveProject.deleteOne({
      _id: projectId,
      created_by_user_id: userId,
    });

    // 4. Check if a project was actually deleted
    if (projectDeleteResult.deletedCount === 0) {
      return res.status(404).json({
        error: "Project not found or not owned by the user.",
      });
    }

    // 5. Send a success response
    return res.status(200).json({ message: "Project deleted successfully." });
  } catch (error) {
    console.error("Delete Project Error:", error);
    return res.status(500).json({ error: "Server error." });
  }
};
// Done
const addRepoToProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const { githubRepos, userId } = req.body;
    const repoList = Array.isArray(githubRepos) ? githubRepos : [githubRepos];

    if (!userId) {
      return res.status(400).json({ error: "Missing userId." });
    }

    const user = await getUserById(userId);
    if (!user || !user.auth?.providers?.github?.access_token) {
      return res.status(403).json({ error: "GitHub not connected for user." });
    }

    const githubToken = user.auth.providers.github.access_token;
    const username = user.auth.providers.github.username;

    if (!username) {
      return res.status(400).json({ error: "GitHub username is missing." });
    }

    const octokit = new Octokit({ auth: githubToken });
    const project = await ActiveProject.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    for (const repoName of repoList) {
      const { data: repo } = await octokit.repos.get({
        owner: username,
        repo: repoName,
      });

      const alreadyExists = project.code_repositories.some(
        (r) => r.repo_id === repo.id || r.repo_url === repo.html_url
      );

      if (alreadyExists) {
        console.log(`⏩ Repo "${repo.name}" already exists in project.`);
        continue;
      }

      const { data: languages } = await octokit.repos.listLanguages({
        owner: username,
        repo: repoName,
      });

      const sortedLanguages = Object.entries(languages || {}).sort(
        (a, b) => b[1] - a[1]
      );
      const mostUsedLanguage = sortedLanguages[0]?.[0] || "Unknown";

      const { data: contributors } = await octokit.repos.listContributors({
        owner: username,
        repo: repoName,
      });

      const totalCommits = contributors.reduce(
        (sum, contributor) => sum + contributor.contributions,
        0
      );

      const { data: commits } = await octokit.repos.listCommits({
        owner: username,
        repo: repoName,
        per_page: 2,
      });

      const lastCommits = commits.map((commit) => ({
        message: commit.commit.message,
        url: commit.html_url,
        date: new Date(commit.commit.author?.date),
        author: commit.commit.author?.name || "Unknown",
      }));

      const newRepo = {
        repo_id: repo.id,
        repo_name: repo.name,
        repo_url: repo.html_url,
        description: repo.description || "",
        branches: [],
        primary_language: repo.language || mostUsedLanguage,
        languages: languages || {},

        github_stats: {
          exploration_count: 0,
          total_commits: totalCommits,
          last_commit_date: lastCommits[0]?.date || null,
          progress_percent: 0,
          stars: repo.stargazers_count || 0,
          forks: repo.forks_count || 0,
          watchers: repo.watchers_count || 0,
          open_issues: repo.open_issues_count || 0,
          last_commits: lastCommits,
        },

        visibility: repo.private ? "private" : "public",
      };

      project.code_repositories.push(newRepo);
    }

    // ✅ Update project-level github_stats_summary
    const totalRepos = project.code_repositories.length;
    let totalCommits = 0;
    let totalStars = 0;
    let totalForks = 0;
    let totalWatchers = 0;
    let totalOpenIssues = 0;

    const allLanguages = [];

    for (const repo of project.code_repositories) {
      const stats = repo.github_stats || {};
      totalCommits += stats.total_commits || 0;
      totalStars += stats.stars || 0;
      totalForks += stats.forks || 0;
      totalWatchers += stats.watchers || 0;
      totalOpenIssues += stats.open_issues || 0;

      if (repo.languages && typeof repo.languages === "object") {
        allLanguages.push(repo.languages);
      }
    }

    // Combine all language data into one object
    // Combine all language data into one object
    const languageByteCount = {};
    for (const langObj of allLanguages) {
      for (const [lang, bytes] of Object.entries(langObj)) {
        languageByteCount[lang] = (languageByteCount[lang] || 0) + bytes;
        console.log(lang, bytes, languageByteCount[lang]);
      }
    }
    console.log("Language byte count:", languageByteCount);

    // ✅ Safer way to find the top language
    let mostUsedLanguage = "Unknown";
    let maxBytes = 0;

    for (const [lang, bytes] of Object.entries(languageByteCount)) {
      if (bytes > maxBytes) {
        maxBytes = bytes;
        mostUsedLanguage = lang;
      }
    }
    console.log("Most used language:", mostUsedLanguage);

    project.github_stats_summary = {
      total_repos: totalRepos,
      average_commits: totalRepos ? Math.round(totalCommits / totalRepos) : 0,
      average_stars: totalRepos ? Math.round(totalStars / totalRepos) : 0,
      average_forks: totalRepos ? Math.round(totalForks / totalRepos) : 0,
      average_watchers: totalRepos ? Math.round(totalWatchers / totalRepos) : 0,
      average_issues: totalRepos ? Math.round(totalOpenIssues / totalRepos) : 0,
    };

    await project.save();

    return res.status(200).json({
      message: "Repositories added successfully",
      updatedProject: project,
    });
  } catch (error) {
    console.error("❌ Error adding repo to project:", error.message);
    return res.status(500).json({
      message: "Failed to add GitHub repo to project",
      error: error.message,
    });
  }
};

module.exports = {
  createGithubRepo,
  createProjectEntry,
  fetchRepos,
  changeRepoVisibility,
  getSpecificRepoAnalysis,
  getAllRepoAnalysis,
  updateProject,
  syncGithubRepoToDB,
  getProjectById,
  retireProject,
  addRepoToProject,
  getAllProjects,
  deleteProject,
};
