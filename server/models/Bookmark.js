const mongoose = require("mongoose");

const bookmarkSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
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
  },
  { timestamps: true } // adds createdAt & updatedAt
);

module.exports = mongoose.model("Bookmark", bookmarkSchema);
