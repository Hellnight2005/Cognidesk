const mongoose = require("mongoose");
const { Schema } = mongoose;

// Collaborator Subschema
const CollaboratorSchema = new Schema(
  {
    username: { type: String, required: true },
    profile_url: { type: String },
    avatar_url: { type: String },
    role: {
      type: String,
      enum: ["admin", "write", "read"],
      default: "read",
    },
  },
  { _id: false }
);

// Last Commit Subschema
const LastCommitSchema = new Schema(
  {
    commit_message: { type: String, required: true },
    committed_at: { type: Date, required: true },
    author_name: { type: String },
    author_username: { type: String },
    commit_url: { type: String },
  },
  { _id: false }
);

// Code Repository Subschema
const CodeRepoSchema = new Schema(
  {
    github_repo_id: { type: Number, required: true },
    name: { type: String, required: true },
    full_name: { type: String, required: true },
    html_url: { type: String, required: true },
    clone_url: { type: String },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public",
    },
    default_branch: { type: String },
    created_at: { type: Date },
    updated_at: { type: Date },
    has_issues: { type: Boolean },
    has_projects: { type: Boolean },
    open_issues_count: { type: Number },
    forks_count: { type: Number },
    watchers_count: { type: Number },
    stargazers_count: { type: Number },
    open_issues: { type: Number },
    watchers: { type: Number },
    deployments_url: { type: String },
    topics: [String],
    collaborators: [CollaboratorSchema],
  },
  { _id: false }
);

// Main Active Project Schema
const ActiveProjectSchema = new Schema(
  {
    name: { type: String, required: true },
    goal: { type: String },
    description: { type: String },
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
    tags: [String],

    // Relation to original idea
    origin_idea: {
      type: Schema.Types.ObjectId,
      ref: "Idea",
      required: true,
    },

    // GitHub Repos
    code_repositories: [CodeRepoSchema],

    // GitHub Stats
    github_stats: {
      exploration_count: { type: Number, default: 0 },
      total_commits: { type: Number, default: 0 },
      last_commit_date: { type: Date },
      progress_percent: { type: Number, min: 0, max: 100 },
      stars: { type: Number, default: 0 },
      forks: { type: Number, default: 0 },
      last_commits: [LastCommitSchema],
    },

    what_i_learned: { type: String },
    would_i_do_it_again: { type: Boolean },

    created_by_user_id: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = ActiveProjectSchema;
