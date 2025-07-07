const mongoose = require("mongoose");
const { Schema } = mongoose;

// Code Repository Subschema
const CodeRepoSchema = new Schema({
  repo_name: { type: String }, // e.g., "cogni-client"
  repo_url: { type: String, required: true }, // e.g., GitHub link
  description: { type: String },
  primary_language: { type: String },
  top_languages: [String], // e.g., ["TypeScript", "JavaScript"]
  language_breakdown: Schema.Types.Mixed, // Raw GitHub language breakdown
  is_private: { type: Boolean, default: false },
  collaborators: [
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
  ],
  added_at: { type: Date, default: Date.now },
});

// Main Active Project Schema
const ActiveProjectSchema = new Schema(
  {
    // Basic Info
    name: { type: String, required: true }, // Usually same as `goal`
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
    deadline: { type: Date },
    completion_date: { type: Date },
    tags: [String],

    // Relationships
    origin_idea_id: { type: String }, // Nullable for now

    // GitHub Repo Info
    code_repositories: [CodeRepoSchema],

    // GitHub Progress & Analytics
    github_stats: {
      exploration_count: { type: Number, default: 0 },
      total_commits: { type: Number, default: 0 },
      last_commit_date: { type: Date },
      progress_percent: { type: Number, min: 0, max: 100 },
      stars: { type: Number, default: 0 },
      forks: { type: Number, default: 0 },
    },

    // Milestone linkage
    milestone_ids: [String],

    // Retrospective (reflection)
    what_i_learned: { type: String },
    would_i_do_it_again: { type: Boolean },

    // Ownership
    created_by_user_id: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = ActiveProjectSchema;
