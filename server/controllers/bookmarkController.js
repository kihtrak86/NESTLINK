const mongoose = require("mongoose");
const Bookmark = require("../models/Bookmark");
const Folder = require("../models/Folder");
const {
  normalizeText,
  buildBookmarkEmbeddingText,
  computeContentHash,
  isValidEmbedding,
} = require("../utils/embeddingText");
const {
  EmbeddingServiceError,
  generateEmbedding,
  generateBookmarkEmbeddingData,
} = require("../services/embeddingService");
const { defaultProcessingQueue } = require("../services/bookmarkProcessingQueue");

const DEFAULT_VECTOR_INDEX_NAME = process.env.ATLAS_VECTOR_INDEX_NAME || "bookmark_vector_index";
const MAX_SEMANTIC_QUERY_LENGTH = 500;
const DEFAULT_SEMANTIC_LIMIT = 10;
const MAX_SEMANTIC_LIMIT = 50;

// Escapes special regex characters for safe keyword search
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Strips internal embedding/hash fields before returning any bookmark to the client
const sanitizeBookmark = (doc) => {
  if (!doc) return doc;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  delete obj.embedding;
  delete obj.embeddingModel;
  delete obj.embeddingContentHash;
  delete obj.embeddingUpdatedAt;
  delete obj.contentHash;
  return obj;
};

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

// Helper: schedules Phase 2 async processing only when DB is connected and not disabled
const scheduleBackgroundAiProcessing = (bookmarkId, userId, options = {}) => {
  if (
    process.env.AI_AUTO_PROCESS === "false" ||
    !bookmarkId ||
    mongoose.connection.readyState !== 1
  ) {
    return { queued: false, deduplicated: false };
  }
  return defaultProcessingQueue.enqueue(bookmarkId, userId, options);
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
      const regex = new RegExp(escapeRegex(search), "i");
      query.$or = [
        { title: regex },
        { description: regex },
        { folder: regex },
        { tags: regex },
        { "aiSummary.text": regex },
      ];
    }

    const [bookmarks, total] = await Promise.all([
      Bookmark.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Bookmark.countDocuments(query),
    ]);

    res.status(200).json({
      bookmarks: bookmarks.map(sanitizeBookmark),
      pagination: {
        total,
        page,
        limit,
        pages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch bookmarks" });
  }
};

// @desc  Semantic search across the logged-in user's bookmarks via MongoDB Atlas Vector Search
//        Supports ?q= ?limit= ?folder= ?tag= ?minScore=
// @route GET /api/bookmarks/semantic-search
const semanticSearchBookmarks = async (req, res) => {
  try {
    const rawQuery = typeof req.query.q === "string" ? req.query.q : "";
    const query = normalizeText(rawQuery, MAX_SEMANTIC_QUERY_LENGTH + 1);

    if (!query) {
      return res.status(400).json({
        message: "Query parameter 'q' is required and cannot be empty.",
      });
    }

    if (query.length > MAX_SEMANTIC_QUERY_LENGTH) {
      return res.status(400).json({
        message: `Query cannot exceed ${MAX_SEMANTIC_QUERY_LENGTH} characters.`,
      });
    }

    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), MAX_SEMANTIC_LIMIT)
      : DEFAULT_SEMANTIC_LIMIT;

    const parsedMinScore =
      req.query.minScore !== undefined
        ? parseFloat(req.query.minScore)
        : parseFloat(process.env.SEMANTIC_MIN_SCORE || "0");
    const minScore = Number.isFinite(parsedMinScore)
      ? Math.min(Math.max(parsedMinScore, 0), 1)
      : 0;

    const folder = typeof req.query.folder === "string" ? req.query.folder.trim() : "";
    const tag = typeof req.query.tag === "string" ? req.query.tag.trim() : "";

    const userObjectId =
      req.user._id instanceof mongoose.Types.ObjectId
        ? req.user._id
        : new mongoose.Types.ObjectId(req.user._id);

    // Generate normalized 384-dim query embedding
    const { embedding: queryVector } = await generateEmbedding(query);

    const vectorFilter = { user: userObjectId };
    const postMatch = { user: userObjectId };
    if (folder && folder !== "All") {
      postMatch.folder = folder;
    }
    if (tag && tag !== "All") {
      postMatch.tags = tag;
    }

    // Over-fetch slightly inside Atlas Vector Search when optional folder/tag filters are active
    const vectorLimit =
      (folder && folder !== "All") || (tag && tag !== "All")
        ? Math.min(limit * 3, 150)
        : limit;
    const numCandidates = Math.min(Math.max(vectorLimit * 10, 50), 1000);

    const pipeline = [
      {
        $vectorSearch: {
          index: process.env.ATLAS_VECTOR_INDEX_NAME || DEFAULT_VECTOR_INDEX_NAME,
          path: "embedding",
          queryVector,
          numCandidates,
          limit: vectorLimit,
          filter: vectorFilter,
        },
      },
      // Defensive user isolation & optional folder/tag filtering
      { $match: postMatch },
      {
        $addFields: {
          score: { $meta: "vectorSearchScore" },
        },
      },
      ...(minScore > 0 ? [{ $match: { score: { $gte: minScore } } }] : []),
      { $limit: limit },
      {
        $project: {
          embedding: 0,
          embeddingModel: 0,
          embeddingContentHash: 0,
          embeddingUpdatedAt: 0,
          contentHash: 0,
        },
      },
    ];

    const rawResults = await Bookmark.aggregate(pipeline);
    const results = rawResults.map((item) => ({
      ...sanitizeBookmark(item),
      score: typeof item.score === "number" ? Number(item.score.toFixed(4)) : 0,
    }));

    return res.status(200).json({
      query,
      results,
      count: results.length,
      limit,
    });
  } catch (error) {
    if (error instanceof EmbeddingServiceError) {
      console.error("[SemanticSearch] Embedding service error:", error.message);
      return res.status(error.statusCode).json({ message: error.publicMessage });
    }

    const msg = String(error?.message || "");
    if (
      msg.includes("$vectorSearch") ||
      msg.includes("SearchNotEnabled") ||
      msg.includes("index not found") ||
      error?.code === 40324
    ) {
      console.error("[SemanticSearch] MongoDB Atlas Vector Search error:", msg);
      return res.status(503).json({
        message:
          "AI Semantic Search requires MongoDB Atlas Vector Search to be configured. Please verify the vector index.",
      });
    }

    console.error("[SemanticSearch] Unexpected error:", msg);
    return res.status(500).json({ message: "Failed to run semantic search" });
  }
};

// @desc  Get all distinct tags for the logged-in user
// @route GET /api/bookmarks/tags
const getTags = async (req, res) => {
  try {
    const tags = await Bookmark.distinct("tags", { user: req.user._id });
    res.status(200).json(tags.filter(Boolean).sort((a, b) => a.localeCompare(b)));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tags" });
  }
};

// @desc  Create a bookmark (generates initial embedding & queues non-blocking Phase 2 AI pipeline)
// @route POST /api/bookmarks
const createBookmark = async (req, res) => {
  try {
    const { title, description = "", url, folder, tags, autoProcess = true } = req.body;

    const willAutoProcess =
      autoProcess !== false &&
      process.env.AI_AUTO_PROCESS !== "false" &&
      mongoose.connection.readyState === 1;

    const bookmarkPayload = {
      title,
      description,
      url,
      folder,
      tags,
      user: req.user._id,
      processingStatus: willAutoProcess ? "pending" : "idle",
    };

    // Validate before making an external embedding call
    const draftBookmark = new Bookmark(bookmarkPayload);
    await draftBookmark.validate();

    // Generate embedding; degrade gracefully if the embedding service is temporarily down
    try {
      const embeddingData = await generateBookmarkEmbeddingData({
        title: draftBookmark.title,
        description: draftBookmark.description,
        url: draftBookmark.url,
        folder: draftBookmark.folder,
        tags: draftBookmark.tags,
      });
      if (embeddingData) {
        Object.assign(draftBookmark, embeddingData);
      }
    } catch (embeddingErr) {
      console.warn(
        "[CreateBookmark] Embedding generation failed; bookmark saved without embedding:",
        embeddingErr.message
      );
    }

    const bookmark = await draftBookmark.save();
    await ensureFolderExists(req.user._id, bookmark.folder);

    if (willAutoProcess) {
      scheduleBackgroundAiProcessing(bookmark._id, req.user._id);
    }

    res.status(201).json(sanitizeBookmark(bookmark));
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(", ") });
    }
    res.status(500).json({ message: "Failed to create bookmark" });
  }
};

// @desc  Update a bookmark (regenerates embedding only when relevant content changed or missing;
//        preserves user edits independently from AI insights)
// @route PUT /api/bookmarks/:id
const updateBookmark = async (req, res) => {
  try {
    const existing = await Bookmark.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).select("+embedding +embeddingContentHash");

    if (!existing) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    const { title, description, url, folder, tags } = req.body;
    const previousUrl = existing.url;

    if (title !== undefined) existing.title = title;
    if (description !== undefined) existing.description = description;
    if (url !== undefined) existing.url = url;
    if (folder !== undefined) existing.folder = folder;
    if (tags !== undefined) existing.tags = tags;

    await existing.validate();

    const urlChanged = url !== undefined && existing.url !== previousUrl;
    if (urlChanged) {
      existing.processingStatus =
        process.env.AI_AUTO_PROCESS !== "false" && mongoose.connection.readyState === 1
          ? "pending"
          : "idle";
      existing.aiProcessingError = null;
    }

    const aiSummaryForEmbedding =
      !urlChanged && existing.aiSummary?.status === "generated" ? existing.aiSummary.text : "";

    const nextText = buildBookmarkEmbeddingText({
      title: existing.title,
      description: existing.description,
      url: existing.url,
      folder: existing.folder,
      tags: existing.tags,
      ...(aiSummaryForEmbedding ? { aiSummary: aiSummaryForEmbedding } : {}),
    });
    const nextHash = computeContentHash(nextText);
    const needsEmbedding =
      !isValidEmbedding(existing.embedding) || existing.embeddingContentHash !== nextHash;

    if (needsEmbedding) {
      try {
        const embeddingData = await generateBookmarkEmbeddingData({
          title: existing.title,
          description: existing.description,
          url: existing.url,
          folder: existing.folder,
          tags: existing.tags,
          ...(aiSummaryForEmbedding ? { aiSummary: aiSummaryForEmbedding } : {}),
        });
        if (embeddingData) {
          existing.embedding = embeddingData.embedding;
          existing.embeddingModel = embeddingData.embeddingModel;
          existing.embeddingContentHash = embeddingData.embeddingContentHash;
          existing.embeddingUpdatedAt = embeddingData.embeddingUpdatedAt;
        }
      } catch (embeddingErr) {
        console.warn(
          "[UpdateBookmark] Embedding regeneration failed; keeping bookmark update:",
          embeddingErr.message
        );
        // Clear stale hash so backfill knows this bookmark needs re-embedding
        existing.embeddingContentHash = undefined;
      }
    }

    const updated = await existing.save();
    await ensureFolderExists(req.user._id, updated.folder);

    if (urlChanged) {
      scheduleBackgroundAiProcessing(updated._id, req.user._id, { force: true });
    }

    res.status(200).json(sanitizeBookmark(updated));
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(", ") });
    }
    res.status(500).json({ message: "Failed to update bookmark" });
  }
};

// @desc  Delete a bookmark (cancels any in-flight Phase 2 job and removes stored embedding)
// @route DELETE /api/bookmarks/:id
const deleteBookmark = async (req, res) => {
  try {
    defaultProcessingQueue.cancelBookmark(req.params.id);

    const bookmark = await Bookmark.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!bookmark) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    res.status(200).json({ message: "Bookmark deleted", id: req.params.id });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete bookmark" });
  }
};

module.exports = {
  getBookmarks,
  semanticSearchBookmarks,
  getTags,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  sanitizeBookmark,
};
