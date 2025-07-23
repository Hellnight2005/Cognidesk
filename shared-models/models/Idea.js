const mongoose = require("mongoose");
const { Schema } = mongoose;

const normalizeEnum = (val, allowed) => {
  if (typeof val !== "string") return val;
  const formatted = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
  return allowed.includes(formatted) ? formatted : val;
};

const FileSchema = new Schema(
  {
    originalname: { type: String, required: true },
    file_name: { type: String, required: true },
    file_category: {
      type: String,
      enum: ["Video", "Document", "Image", "Other"],
      set: (v) => normalizeEnum(v, ["Video", "Document", "Image", "Other"]),
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

const ReferenceSchema = new Schema(
  {
    label: { type: String, default: "Reference" },
    url: { type: String, required: false }, // ⬅️ Make `url` optional
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
      set: (v) => normalizeEnum(v, ["Low", "Medium", "High"]),
      required: true,
    },
    convert_to_project: { type: Boolean, default: false },
    priority_reason: { type: String, default: null },
    source: { type: String, default: null },
    tags: { type: [String], default: [] },

    external_references: {
      type: [ReferenceSchema],
      default: [],
    },
    attached_files: { type: [FileSchema], default: [] },

    exploration_count: { type: Number, default: 0 },
    total_time_spent: { type: Number, default: 0 },
    last_explored_at: { type: Date, default: null },

    completion_status: {
      type: String,
      enum: ["Not Started", "In Progress", "Completed", "Paused"],
      set: (v) =>
        normalizeEnum(v, ["Not Started", "In Progress", "Completed", "Paused"]),
      default: "Not Started",
    },
    importance_level: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      set: (v) => normalizeEnum(v, ["Low", "Medium", "High", "Critical"]),
      default: "Medium",
    },

    fun_rating: { type: Number, min: 1, max: 5, default: null },
    usefulness_rating: { type: Number, min: 1, max: 5, default: null },
    risks_or_challenges: { type: String, default: null },
    notes_on_progress: { type: String, default: null },

    file_status: {
      type: String,
      enum: ["pending", "uploaded", "failed"],
      default: "pending",
    },
    embedding_status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },

    created_by_user_id: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = IdeaSchema;
