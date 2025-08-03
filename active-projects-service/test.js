const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({
  auth: "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", // Make sure to use a Personal Access Token (PAT)
});

async function getCommits() {
  const response = await octokit.request("GET /repos/{owner}/{repo}/commits", {
    owner: "Hellnight2005",
    repo: "Happy-repo-0.7",
    per_page: 100, // number of recent commits to fetch
  });

  const commits = response.data.map((commit) => ({
    commit_message: commit.commit.message,
    committed_at: commit.commit.author.date,
    author_name: commit.commit.author.name,
    author_username: commit.author?.login || null,
    commit_url: commit.html_url,
  }));

  console.log("Recent commits:", commits);
}

getCommits().catch(console.error);
