const axios = require("axios");
const { getUserById } = require("../services/user-services");
const dayjs = require("dayjs");

async function saveDailyJournal(userId, content) {
  if (!userId || !content) throw new Error("Missing userId or content.");

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
    const res = await axios.get("http://localhost:3003/api/projects/repos", {
      params: { userId, search: repoName },
    });
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
  } catch {
    // File doesn't exist – that's okay
  }

  // Append entry with structured format
  const timestamp = dayjs().format("h:mm A");
  const newEntry = `\nTIME: ${timestamp}\nCONTENT: ${content}\n`;

  const updatedContent = `${existingContent}${newEntry}`.trim();
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

// Parse TIME/CONTENT formatted file content
function parseJournalContent(content) {
  const entries = [];
  let current = {};

  content.split("\n").forEach((line) => {
    line = line.trim();
    if (!line) return;

    if (line.startsWith("TIME:")) {
      if (current.time && current.content) {
        entries.push(current);
      }
      current = { time: line.replace("TIME:", "").trim(), content: "" };
    } else if (line.startsWith("CONTENT:")) {
      current.content = line.replace("CONTENT:", "").trim();
    } else {
      current.content += " " + line;
    }
  });

  if (current.time && current.content) {
    entries.push(current);
  }

  return entries;
}

// getTodayJournalEntries
async function getTodayJournalEntries(userId) {
  if (!userId) throw new Error("Missing userId.");

  const user = await getUserById(userId);
  if (!user?.auth?.providers?.github?.access_token) {
    throw new Error("GitHub access token not found.");
  }

  const token = user.auth.providers.github.access_token;
  const githubUsername = user.auth.providers.github.username;
  const repoName = "Daily-journal";

  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
  };

  const todayFile = `${dayjs().format("D-M-YY")}.md`;
  const fileUrl = `https://api.github.com/repos/${githubUsername}/${repoName}/contents/${todayFile}`;

  try {
    const fileRes = await axios.get(fileUrl, { headers });
    if (!fileRes?.data?.content) return {};

    const content = Buffer.from(fileRes.data.content, "base64")
      .toString("utf-8")
      .trim();

    return { [todayFile]: parseJournalContent(content) };
  } catch (err) {
    console.error("No journal for today or fetch failed:", err.message);
    return {};
  }
}

async function getMonthlyJournal(userId) {
  if (!userId) throw new Error("Missing userId.");

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

  let files = [];
  try {
    const res = await axios.get(
      `https://api.github.com/repos/${githubUsername}/${repoName}/contents`,
      { headers }
    );
    files = res.data || [];
  } catch (err) {
    console.error("Failed to fetch repo contents:", err.message);
    return {};
  }

  // Only accept files like D-M-YY.md
  const journalFiles = files.filter((file) =>
    /^(\d+)-(\d+)-(\d+)\.md$/.test(file.name)
  );

  const grouped = {};

  journalFiles.forEach((file) => {
    const [day, month, year] = file.name.replace(".md", "").split("-");

    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][month]) grouped[year][month] = {};

    // Since only one file per day, store file name directly
    grouped[year][month][day] = file.name;
  });

  return grouped;
}

async function analyzeMonthlyJournal(userId) {
  if (!userId) throw new Error("Missing userId.");

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

  let files = [];
  try {
    const res = await axios.get(
      `https://api.github.com/repos/${githubUsername}/${repoName}/contents`,
      { headers }
    );
    files = res.data || [];
  } catch (err) {
    return {};
  }

  const datedFiles = files.filter((file) =>
    /^(\d+)-(\d+)-(\d+)\.md$/.test(file.name)
  );

  const allEntries = await Promise.all(
    datedFiles.map(async (file) => {
      try {
        const res = await axios.get(file.download_url, { headers });
        const parsedEntries = parseJournalContent(res.data);
        const wordCount = parsedEntries.reduce(
          (sum, e) => sum + e.content.split(/\s+/).filter(Boolean).length,
          0
        );
        return { date: file.name.replace(".md", ""), wordCount };
      } catch {
        return null;
      }
    })
  );

  const validEntries = allEntries.filter(Boolean);

  const currentMonth = dayjs().format("M");
  const currentYear = dayjs().format("YY");

  const monthlyEntries = validEntries.filter((e) => {
    const [, month, year] = e.date.split("-");
    return month === currentMonth && year === currentYear;
  });

  const totalEntries = validEntries.length;
  const monthlyCount = monthlyEntries.length;
  const averageWords =
    monthlyCount > 0
      ? Math.round(
          monthlyEntries.reduce((sum, e) => sum + e.wordCount, 0) / monthlyCount
        )
      : 0;

  return { totalEntries, monthlyEntries: monthlyCount, averageWords };
}

// Fetch journal entries for any specific date (read-only)
async function getJournalByDate(userId, date) {
  if (!userId || !date) throw new Error("Missing userId or date.");

  const user = await getUserById(userId);
  if (!user?.auth?.providers?.github?.access_token) {
    throw new Error("GitHub access token not found.");
  }

  const token = user.auth.providers.github.access_token;
  const githubUsername = user.auth.providers.github.username;
  const repoName = "Daily-journal";

  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
  };

  // Convert date input to D-M-YY format if Date object
  let fileName;
  if (date instanceof Date) {
    fileName = `${dayjs(date).format("D-M-YY")}.md`;
  } else {
    fileName = `${date}.md`; // expecting string in D-M-YY format
  }

  const fileUrl = `https://api.github.com/repos/${githubUsername}/${repoName}/contents/${fileName}`;

  try {
    const fileRes = await axios.get(fileUrl, { headers });
    if (!fileRes?.data?.content) return {};

    const content = Buffer.from(fileRes.data.content, "base64")
      .toString("utf-8")
      .trim();

    // Parse TIME/CONTENT entries
    return { [fileName]: parseJournalContent(content) };
  } catch (err) {
    console.error(
      "Journal for this date not found or fetch failed:",
      err.message
    );
    return {};
  }
}

module.exports = {
  saveDailyJournal,
  getTodayJournalEntries,
  getMonthlyJournal,
  analyzeMonthlyJournal,
  getJournalByDate,
};
