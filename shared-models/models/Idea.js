const mongoose = require("mongoose");
const { Schema } = mongoose;

const FileSchema = new Schema(
  {
    file_name: { type: String, required: true },
    file_category: {
      type: String,
      enum: ["Video", "Document", "Image", "Other"],
      set: (v) => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(),
      required: true,
    },
    file_type: { type: String, required: true },
    drive_folder_link: { type: String, required: true },
    drive_file_link: { type: String, required: true },
    video_duration_minutes: { type: Number, default: null },
    uploaded_at: { type: Date, required: true },
  },
  { _id: false }
);

const IdeaSchema = new Schema(
  {
    idea_title: { type: String, required: true },
    idea_description: { type: String, required: true },
    category: { type: String, required: true },
    sub_category: { type: String, default: null },
    curiosity_level: {
      type: String,
      enum: ["Low", "Medium", "High"],
      set: (v) => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(),
      required: true,
    },
    convert_to_project: { type: Boolean, default: false },
    priority_reason: { type: String, default: null },
    source: { type: String, default: null },
    tags: { type: [String], default: [] },

    attached_files: { type: [FileSchema], default: [] },

    exploration_count: { type: Number, default: 0 },
    total_time_spent: { type: Number, default: 0 }, // in minutes
    last_explored_at: { type: Date, default: null },

    completion_status: {
      type: String,
      enum: ["Not Started", "In Progress", "Completed", "Paused"],
      set: (v) => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(),
      default: "Not Started",
    },
    importance_level: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      set: (v) => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(),
      default: "Medium",
    },
    fun_rating: { type: Number, min: 1, max: 5, default: null },
    usefulness_rating: { type: Number, min: 1, max: 5, default: null },
    risks_or_challenges: { type: String, default: null },
    notes_on_progress: { type: String, default: null },

    created_by_user_id: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = IdeaSchema;
