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
async function createRepo(req, res) {
  const {
    title,
    goal,
    description,
    deadline,
    tags = [],
    created_by_user_id,
    collaborators = [],
    is_private = false,
    origin_idea = null,
    priority = "Medium",
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
    const repoName = repo.name;
    const owner = repo.owner.login;
    const repoCreatedDate = new Date(repo.created_at);

    // 2. Add collaborators
    for (const collab of collaborators) {
      if (collab.username && collab.role) {
        await octokit.repos.addCollaborator({
          owner,
          repo: repoName,
          username: collab.username,
          permission: collab.role === "admin" ? "admin" : collab.role,
        });
      }
    }

    // 3. Fetch topics
    let topics = [];
    try {
      const topicsRes = await octokit.repos.getAllTopics({
        owner,
        repo: repoName,
      });
      topics = topicsRes.data.names || [];
    } catch {
      console.warn("⚠️ Unable to fetch topics.");
    }

    // 4. Fetch languages
    let allLanguages = {};
    let mostUsedLanguage = "Unknown";
    try {
      const langRes = await octokit.repos.listLanguages({
        owner,
        repo: repoName,
      });
      allLanguages = langRes.data || {};
      const sorted = Object.entries(allLanguages).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) mostUsedLanguage = sorted[0][0];
    } catch {
      console.warn("⚠️ No languages found.");
    }

    // 5. Fetch last 2 commits
    let last_commits = [];
    try {
      const commitsRes = await octokit.repos.listCommits({
        owner,
        repo: repoName,
        per_page: 2,
      });

      const rawCommits = commitsRes.data || [];

      last_commits = rawCommits
        .filter((commit) => commit?.commit)
        .map((commit) => {
          const commitData = commit.commit;
          const authorInfo = commitData.author || {};
          const githubAuthor = commit.author || {};

          return {
            commit_message: commitData.message || "No commit message",
            commit_url: commit.html_url || null,
            author_name: authorInfo.name || githubAuthor.login || "Unknown",
            author_username: githubAuthor.login || null,
            committed_at: authorInfo.date
              ? new Date(authorInfo.date)
              : new Date(),
          };
        });
    } catch (err) {
      console.warn(
        `⚠️ No commits found or error occurred for repo: ${repoName}`,
        err.message
      );
    }

    // Fallback commits if empty
    if (last_commits.length < 2) {
      const fallbackCommit = {
        commit_message: "Initial commit",
        commit_url: repo.html_url,
        author_name: user.name || "Unknown",
        author_username: user.username || "unknown",
        committed_at: new Date(),
      };
      while (last_commits.length < 2) {
        last_commits.push(fallbackCommit);
      }
    }

    // 6. Get branches
    let branches = [];
    try {
      const branchRes = await octokit.repos.listBranches({
        owner,
        repo: repoName,
      });
      branches = branchRes.data.map((b) => b.name);
    } catch {
      branches = ["main"];
    }

    // 7. Create project
    const resolvedDeadline = deadline
      ? new Date(deadline)
      : new Date(repoCreatedDate.getTime() + 90 * 24 * 60 * 60 * 1000);

    const project = await ActiveProject.create({
      created_by_user_id,
      origin_idea,
      title,
      description: repoDescription,
      start_date: repoCreatedDate,
      deadline: resolvedDeadline,
      status: "Planning",
      priority,
      code_repositories: [
        {
          repo_id: repo.id,
          repo_name: repoName,
          repo_url: repo.html_url,
          description: repoDescription,
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
    });

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

// done
async function fetchRepos(req, res) {
  const userId = req.body.userId || req.query.userId;
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
    const filtered = repos.filter((repo) => {
      return (
        repo.name.toLowerCase().includes(search) ||
        (repo.description?.toLowerCase().includes(search) ?? false)
      );
    });

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

    const allRepos = [];

    projects.forEach((project) => {
      project.code_repositories.forEach((repo) => {
        allRepos.push({
          repo_name: repo.repo_name,
          repo_id: repo.repo_id,
          project_title: project.title,
          project_status: project.status,
          priority: project.priority,
          deadline: project.deadline,
          description: repo.description,
          primary_language: repo.primary_language,
          tags: project.tags || [],
          stats: repo.github_stats || {},
        });
      });
    });

    // Use the utility function to compute stats
    const result = calculateRepoStats(allRepos);

    return res.json(result);
  } catch (error) {
    console.error("Error in getAllRepoAnalysis:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
}

// Done
async function updateRepo(req, res) {
  const { userId, repoId, priority, status } = req.body;

  if (!userId || !repoId) {
    return res.status(400).json({ error: "userId and repoId are required." });
  }

  try {
    const project = await ActiveProject.findOne({
      created_by_user_id: userId,
      "code_repositories.repo_id": parseInt(repoId),
    });

    if (!project) {
      return res
        .status(404)
        .json({ error: "Project with that repo not found." });
    }

    // Update only if values are provided
    if (priority !== undefined) project.priority = priority;
    if (status !== undefined) project.status = status;

    await project.save();

    return res.status(200).json({
      message: "Project priority/status updated successfully.",
      updated: {
        priority: project.priority,
        status: project.status,
      },
    });
  } catch (error) {
    console.error("Update Repo Error:", error);
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
};
