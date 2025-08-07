const axios = require("axios");
const { getUserById } = require("../services/user-services");
const dayjs = require("dayjs");

async function saveDailyJournal(userId, content) {
  if (!userId || !content) {
    throw new Error("Missing userId or content.");
  }

  const user = await getUserById(userId);
  if (!user || !user.auth?.providers?.github?.access_token) {
    throw new Error("GitHub access token not found.");
  }

  const token = user.auth.providers.github.access_token;
  const githubUsername = user.auth.providers.github.username;
  const repoName = "Daily-journal";
  const dateFile = `${dayjs().format("D-M-YY")}.md`;

  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
  };

  // Step 1: Check if repo exists
  let repoExists = false;
  try {
    const res = await axios.post(
      `http://localhost:3003/api/projects/repos?search=${repoName}`,
      {
        userId,
      }
    );
    repoExists = res.data?.some((repo) => repo.repo_name === repoName);
  } catch (err) {
    console.error("Repo check failed:", err.message);
  }

  // Step 2: Create repo if not exists
  if (!repoExists) {
    await axios.post(
      `https://api.github.com/user/repos`,
      {
        name: repoName,
        private: true,
        description: `This repo maintains all the daily thoughts of ${
          user.profile?.display_name || "the user"
        }`,
      },
      { headers }
    );
  }

  // Step 3: Check if file exists
  const fileUrl = `https://api.github.com/repos/${githubUsername}/${repoName}/contents/${dateFile}`;
  let existingContent = "";
  let sha = null;

  try {
    const fileRes = await axios.get(fileUrl, { headers });
    if (fileRes?.data?.content) {
      existingContent = Buffer.from(fileRes.data.content, "base64").toString(
        "utf-8"
      );
      sha = fileRes.data.sha;
    }
  } catch (err) {
    // File doesn't exist – that's okay
  }

  const updatedContent = `${existingContent}\n\n${content}`.trim();
  const encoded = Buffer.from(updatedContent).toString("base64");

  // Step 4: Create or update file
  await axios.put(
    fileUrl,
    {
      message: `journal entry for ${dateFile}`,
      content: encoded,
      sha: sha || undefined,
    },
    { headers }
  );

  return { success: true, message: "Journal saved to GitHub." };
}

async function getMonthlyJournal(userId) {
  if (!userId) {
    throw new Error("Missing userId.");
  }

  const user = await getUserById(userId);
  if (!user || !user.auth?.providers?.github?.access_token) {
    throw new Error("GitHub access token not found.");
  }

  const token = user.auth.providers.github.access_token;
  const githubUsername = user.auth.providers.github.username;
  const repoName = "Daily-journal";

  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
  };

  // Step 1: Get all files from the repo
  let files = [];
  try {
    const res = await axios.get(
      `https://api.github.com/repos/${githubUsername}/${repoName}/contents`,
      { headers }
    );
    files = res.data || [];
  } catch (err) {
    console.error("Failed to fetch repo contents:", err.message);
    return [];
  }

  const currentMonth = dayjs().format("M");
  const currentYear = dayjs().format("YY");

  // Step 2: Filter files for the current month/year (format: D-M-YY.md)
  const journalFiles = files.filter((file) => {
    const match = file.name.match(/^(\d+)-(\d+)-(\d+)\.md$/);
    if (!match) return false;
    const [, , month, year] = match;
    return month === currentMonth && year === currentYear;
  });

  // Step 3: Fetch content for each file
  const entries = await Promise.all(
    journalFiles.map(async (file) => {
      try {
        const res = await axios.get(file.url, { headers });
        const content = Buffer.from(res.data.content, "base64").toString(
          "utf-8"
        );
        return {
          date: file.name.replace(".md", ""),
          content,
        };
      } catch (err) {
        console.error(`Failed to fetch ${file.name}:`, err.message);
        return null;
      }
    })
  );

  return entries.filter(Boolean); // remove failed/null entries
}

module.exports = {
  saveDailyJournal,
  getMonthlyJournal,
};
