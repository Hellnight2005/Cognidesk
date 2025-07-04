// models/User.js
const mongoose = require("mongoose");
const { Schema, model } = mongoose;

// 🔐 Auth Subschema — supports both Google & GitHub login
const AuthSchema = new Schema(
  {
    providers: {
      google: {
        google_id: { type: String, default: null },
        email_verified: { type: Boolean, default: false },
        profile_link: { type: String, default: null },
        picture: { type: String, default: null },
        access_token: { type: String, default: null },
        refresh_token: { type: String, default: null },
        token_expires_at: { type: Date, default: null },
      },
      github: {
        github_id: { type: String, default: null },
        username: { type: String, default: null },
        profile_link: { type: String, default: null },
        avatar_url: { type: String, default: null },
        access_token: { type: String, default: null },
        token_expires_at: { type: Date, default: null },
      },
    },
    email: { type: String, required: true }, // primary identifier
    login_methods: {
      type: [String],
      enum: ["google", "github", "email"],
      default: [],
    },
  },
  { _id: false }
);

// 👤 Profile Info
const ProfileSchema = new Schema(
  {
    display_name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    bio: String,
    profile_photo_url: String,
  },
  { _id: false }
);

// ⚙️ Settings
const SettingsSchema = new Schema(
  {
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "system",
    },
    timezone: { type: String, default: null },
    ip_address: { type: String, default: null },
    location: {
      country: String,
      region: String,
      city: String,
      timezone: String,
    },
    role: {
      type: String,
      enum: ["user", "admin", "superadmin"],
      default: "user",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
  },
  { _id: false }
);

// 🧠 Knowledge Tracking (curiosities removed)
const KnowledgeSchema = new Schema(
  {
    idea_vault: [{ type: Schema.Types.ObjectId, ref: "IdeaVault" }],
    active_projects: [{ type: Schema.Types.ObjectId, ref: "Project" }],
    retired_projects: [{ type: Schema.Types.ObjectId, ref: "Project" }],
    weekly_routines: [{ type: Schema.Types.ObjectId, ref: "Routine" }],
    mini_missions: [{ type: Schema.Types.ObjectId, ref: "Mission" }],
  },
  { _id: false }
);

// 📊 User Analytics
// 📊 User Analytics
const AnalyticsSchema = new Schema(
  {
    login_count: { type: Number, default: 0 },
    last_login_at: Date,
    daily_active_streak: { type: Number, default: 0 },
    last_active_date: Date,

    idea_count: { type: Number, default: 0 },
    project_count: { type: Number, default: 0 },
    weekly_entries_count: { type: Number, default: 0 },
    mini_mission_count: { type: Number, default: 0 },

    average_idea_rating: Number,
    average_topic_depth: Number, // ✅ renamed from average_curiosity_depth
    project_completion_rate: Number,
    exploration_time_total: { type: Number, default: 0 }, // in minutes
    most_explored_topic: String, // ✅ renamed from most_explored_category
  },
  { _id: false }
);

// 🧩 Device Info Schema
const DeviceSchema = new Schema(
  {
    fingerprint: { type: String, unique: true, sparse: true },
    user_agent: String,
    platform: String,
    last_used_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

// 📦 Full User Schema
const UserSchema = new Schema({
  profile: ProfileSchema,
  auth: AuthSchema,
  settings: SettingsSchema,
  knowledge: KnowledgeSchema,
  analytics: AnalyticsSchema,
  devices: [DeviceSchema], // array of devices
  meta: {
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
});

// 🔄 Auto-update timestamps
UserSchema.pre("save", function (next) {
  this.meta.updatedAt = new Date();
  next();
});

module.exports = UserSchema;
