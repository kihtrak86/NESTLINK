const Bookmark = require("../models/Bookmark");
const Folder = require("../models/Folder");

// Ensures a Folder document exists for this user/name so it shows up in the folder list
const ensureFolderExists = async (userId, folderName) => {
  if (!folderName) return;
  try {
    await Folder.updateOne(
      { user: userId, name: folderName },
      { $setOnInsert: { user: userId, name: folderName } },
      { upsert: true, collation: { locale: "en", strength: 2 } }
    );
  } catch (error) {
    // Ignore duplicate key races; not critical to the bookmark save itself
  }
};

// @desc  Get all bookmarks for logged-in user
//        Supports ?search= ?folder= ?tag= ?page= ?limit=
// @route GET /api/bookmarks
const getBookmarks = async (req, res) => {
  try {
    const { search, folder, tag } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 9, 1), 100);
    const skip = (page - 1) * limit;

    const query = { user: req.user._id };

    if (folder && folder !== "All") {
      query.folder = folder;
    }

    if (tag && tag !== "All") {
      query.tags = tag;
    }

    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [{ title: regex }, { folder: regex }, { tags: regex }];
    }

    const [bookmarks, total] = await Promise.all([
      Bookmark.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Bookmark.countDocuments(query),
    ]);

    res.status(200).json({
      bookmarks,
      pagination: {
        total,
        page,
        limit,
        pages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch bookmarks", error: error.message });
  }
};

// @desc  Get all distinct tags for the logged-in user
// @route GET /api/bookmarks/tags
const getTags = async (req, res) => {
  try {
    const tags = await Bookmark.distinct("tags", { user: req.user._id });
    res.status(200).json(tags.filter(Boolean).sort((a, b) => a.localeCompare(b)));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tags", error: error.message });
  }
};

// @desc  Create a bookmark
// @route POST /api/bookmarks
const createBookmark = async (req, res) => {
  try {
    const { title, url, folder, tags } = req.body;
    const bookmark = await Bookmark.create({
      title,
      url,
      folder,
      tags,
      user: req.user._id,
    });
    await ensureFolderExists(req.user._id, bookmark.folder);
    res.status(201).json(bookmark);
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(", ") });
    }
    res.status(500).json({ message: "Failed to create bookmark", error: error.message });
  }
};

// @desc  Update a bookmark
// @route PUT /api/bookmarks/:id
const updateBookmark = async (req, res) => {
  try {
    const { title, url, folder, tags } = req.body;
    const bookmark = await Bookmark.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { title, url, folder, tags },
      { new: true, runValidators: true }
    );

    if (!bookmark) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    await ensureFolderExists(req.user._id, bookmark.folder);
    res.status(200).json(bookmark);
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(", ") });
    }
    res.status(500).json({ message: "Failed to update bookmark", error: error.message });
  }
};

// @desc  Delete a bookmark
// @route DELETE /api/bookmarks/:id
const deleteBookmark = async (req, res) => {
  try {
    const bookmark = await Bookmark.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!bookmark) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    res.status(200).json({ message: "Bookmark deleted", id: req.params.id });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete bookmark", error: error.message });
  }
};

module.exports = {
  getBookmarks,
  getTags,
  createBookmark,
  updateBookmark,
  deleteBookmark,
};
