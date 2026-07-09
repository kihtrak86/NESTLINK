const Folder = require("../models/Folder");
const Bookmark = require("../models/Bookmark");

// @desc  Get all folders for the logged-in user
// @route GET /api/folders
const getFolders = async (req, res) => {
  try {
    const folders = await Folder.find({ user: req.user._id }).sort({ name: 1 });
    res.status(200).json(folders);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch folders", error: error.message });
  }
};

// @desc  Create a new folder
// @route POST /api/folders
const createFolder = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Folder name is required" });
    }

    const folder = await Folder.create({ name: name.trim(), user: req.user._id });
    res.status(201).json(folder);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "A folder with this name already exists" });
    }
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(", ") });
    }
    res.status(500).json({ message: "Failed to create folder", error: error.message });
  }
};

// @desc  Delete a folder (bookmarks inside are moved to "Uncategorized")
// @route DELETE /api/folders/:id
const deleteFolder = async (req, res) => {
  try {
    const folder = await Folder.findOne({ _id: req.params.id, user: req.user._id });
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    await Bookmark.updateMany(
      { user: req.user._id, folder: folder.name },
      { folder: "Uncategorized" }
    );
    await folder.deleteOne();

    res.status(200).json({ message: "Folder deleted", id: req.params.id });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete folder", error: error.message });
  }
};

module.exports = { getFolders, createFolder, deleteFolder };
