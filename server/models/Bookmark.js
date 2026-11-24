const mongoose = require("mongoose");

const extractedMetadataSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, default: "", maxlength: 300 },
    description: { type: String, trim: true, default: "", maxlength: 1000 },
    ogTitle: { type: String, trim: true, default: "", maxlength: 300 },
    ogDescription: { type: String, trim: true, default: "", maxlength: 1000 },
    ogImage: { type: String, trim: true, default: "", maxlength: 2048 },
    favicon: { type: String, trim: true, default: "", maxlength: 2048 },
    canonicalUrl: { type: String, trim: true, default: "", maxlength: 2048 },
    domain: { type: String, trim: true, default: "", maxlength: 255 },
    author: { type: String, trim: true, default: "", maxlength: 120 },
    publishedAt: { type: String, trim: true, default: "", maxlength: 64 },
    // Bounded excerpt of extracted text (never stores raw HTML or unbounded page dumps)
    textPreview: { type: String, default: "", maxlength: 4000 },
    extractedAt: { type: Date, default: null },
  },
  { _id: false }
);

const aiSummarySchema = new mongoose.Schema(
  {
    text: { type: String, trim: true, default: "", maxlength: 1500 },
    status: {
      type: String,
      enum: ["idle", "generated", "fallback", "failed"],
      default: "idle",
    },
    provider: { type: String, trim: true, default: "", maxlength: 60 },
    model: { type: String, trim: true, default: "", maxlength: 120 },
    updatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const suggestedTagSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    normalized: { type: String, required: true, trim: true, lowercase: true, maxlength: 40 },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    isExistingUserTag: { type: Boolean, default: false },
  },
  { _id: false }
);

const suggestedFolderSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "", maxlength: 60 },
    isNewFolder: { type: Boolean, default: false },
    reason: { type: String, trim: true, default: "", maxlength: 300 },
    status: {
      type: String,
      enum: ["none", "pending", "accepted", "rejected"],
      default: "none",
    },
    updatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const aiProcessingErrorSchema = new mongoose.Schema(
  {
    stage: { type: String, trim: true, default: "", maxlength: 60 },
    message: { type: String, trim: true, default: "", maxlength: 500 },
    retryCount: { type: Number, default: 0, min: 0 },
    occurredAt: { type: Date, default: null },
  },
  { _id: false }
);

const bookmarkSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    url: {
      type: String,
      required: [true, "URL is required"],
      trim: true,
      validate: {
        validator: function (value) {
          try {
            const parsed = new URL(value);
            return parsed.protocol === "http:" || parsed.protocol === "https:";
          } catch (err) {
            return false;
          }
        },
        message: "Please provide a valid URL (must start with http:// or https://)",
      },
    },
    folder: {
      type: String,
      required: [true, "Folder is required"],
      trim: true,
      default: "Personal",
    },
    tags: {
      type: [String],
      default: [],
      set: (tags) =>
        Array.isArray(tags)
          ? tags.map((t) => t.trim()).filter(Boolean)
          : String(tags)
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
    },
    // Phase 1: 384-dimensional vector from sentence-transformers/all-MiniLM-L6-v2
    // Excluded from default queries so vectors are never leaked to frontend responses
    embedding: {
      type: [Number],
      default: undefined,
      select: false,
    },
    embeddingModel: {
      type: String,
      default: undefined,
      select: false,
    },
    embeddingContentHash: {
      type: String,
      default: undefined,
      select: false,
    },
    embeddingUpdatedAt: {
      type: Date,
      default: undefined,
      select: false,
    },
    // Phase 2: Intelligent Bookmark Understanding fields
    extractedMetadata: {
      type: extractedMetadataSchema,
      default: () => ({}),
    },
    aiSummary: {
      type: aiSummarySchema,
      default: () => ({}),
    },
    suggestedTags: {
      type: [suggestedTagSchema],
      default: [],
    },
    suggestedFolder: {
      type: suggestedFolderSchema,
      default: () => ({}),
    },
    processingStatus: {
      type: String,
      enum: ["idle", "pending", "extracting", "analyzing", "completed", "partial", "failed"],
      default: "idle",
    },
    lastProcessedAt: {
      type: Date,
      default: null,
    },
    contentHash: {
      type: String,
      default: "",
      select: false,
    },
    aiProcessingError: {
      type: aiProcessingErrorSchema,
      default: null,
    },
  },
  { timestamps: true } // adds createdAt & updatedAt
);

bookmarkSchema.index({ user: 1, createdAt: -1 });
bookmarkSchema.index({ user: 1, processingStatus: 1 });
bookmarkSchema.index({ user: 1, url: 1 });

module.exports = mongoose.model("Bookmark", bookmarkSchema);
