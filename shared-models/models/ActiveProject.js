const mongoose = require("mongoose");
const { Schema } = mongoose;

// Last Commit Subschema
const LastCommitSchema = new Schema(
  {
    message: String,
    url: String,
    date: Date,
    author: String,
  },
  { _id: false }
);

// GitHub Stats for Each Repo
const GitHubStatsSchema = new Schema(
  {
    exploration_count: { type: Number, default: 0 },
    total_commits: { type: Number, default: 0 },
    last_commit_date: { type: Date },
    progress_percent: { type: Number, min: 0, max: 100 },
    stars: { type: Number, default: 0 },
    forks: { type: Number, default: 0 },
    watchers: { type: Number, default: 0 },
    open_issues: { type: Number, default: 0 },
    last_commits: {
      type: [LastCommitSchema],
      default: [],
    },
  },
  { _id: false }
);

// Code Repository Subschema
const CodeRepoSchema = new Schema(
  {
    repo_id: { type: Number, required: true },
    repo_name: { type: String, required: true },
    repo_url: { type: String, required: true },
    description: String,
    branches: [String], // replaces default_branch
    primary_language: String,
    languages: { type: Map, of: Number }, // { JavaScript: 50, Python: 30, ... }
    github_stats: GitHubStatsSchema,
  },
  { _id: false }
);

// Average GitHub Stats for Entire Project
const AverageGitHubStatsSchema = new Schema(
  {
    total_repos: { type: Number, default: 0 },
    average_commits: { type: Number, default: 0 },
    average_stars: { type: Number, default: 0 },
    average_forks: { type: Number, default: 0 },
    average_watchers: { type: Number, default: 0 },
    average_issues: { type: Number, default: 0 },
  },
  { _id: false }
);

// Active Project Schema
const ActiveProjectSchema = new Schema(
  {
    created_by_user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    origin_idea: {
      type: Schema.Types.ObjectId,
      ref: "Idea",
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String },
    start_date: { type: Date, default: Date.now },
    deadline: {
      type: Date,
      default: function () {
        const threeMonthsLater = new Date(this.start_date || Date.now());
        threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
        return threeMonthsLater;
      },
    },
    completion_date: { type: Date },

    code_repositories: [CodeRepoSchema],
    github_stats_summary: AverageGitHubStatsSchema,

    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    status: {
      type: String,
      enum: ["Planning", "In Progress", "Review", "Completed", "Paused"],
      default: "Planning",
    },
    what_i_learned: { type: String },
    would_i_do_it_again: { type: Boolean },
  },
  { timestamps: true }
);

module.exports = ActiveProjectSchema;
