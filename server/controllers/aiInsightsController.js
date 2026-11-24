const mongoose = require("mongoose");
const Bookmark = require("../models/Bookmark");
const Folder = require("../models/Folder");
const { sanitizeBookmark } = require("./bookmarkController");
const {
  extractWebpageMetadata,
  MetadataExtractionError,
  UrlSecurityError,
} = require("../services/metadataExtractorService");
const {
  generateBookmarkSummary,
  generateTagSuggestions,
  generateFolderRecommendation,
} = require("../services/aiInsightsService");
const { LlmProviderError } = require("../services/llm/llmProvider");
const { defaultProcessingQueue } = require("../services/bookmarkProcessingQueue");
const { generateBookmarkEmbeddingData } = require("../services/embeddingService");
const { normalizeTagKey, mergeUniqueTags, formatTagDisplay } = require("../utils/tagNormalizer");
const logger = require("../utils/logger");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function handleAiError(res, error, fallbackMessage) {
  if (error instanceof UrlSecurityError || error instanceof MetadataExtractionError || error instanceof LlmProviderError) {
    return res.status(error.statusCode || 400).json({
      message: error.publicMessage || fallbackMessage,
      code: error.code,
    });
  }
  logger.error("ai_controller.unexpected_error", { message: error?.message });
  return res.status(500).json({ message: fallbackMessage });
}

async function ensureFolderCaseInsensitive(userId, folderName) {
  const trimmed = String(folderName || "").trim();
  if (!trimmed) return null;

  const existing = await Folder.findOne({ user: userId, name: trimmed }).collation({
    locale: "en",
    strength: 2,
  });
  if (existing) {
    return existing;
  }

  try {
    return await Folder.create({ user: userId, name: trimmed });
  } catch (err) {
    if (err?.code === 11000) {
      return Folder.findOne({ user: userId, name: trimmed }).collation({
        locale: "en",
        strength: 2,
      });
    }
    throw err;
  }
}

async function refreshBookmarkEmbeddingSafe(bookmark) {
  try {
    const embeddingData = await generateBookmarkEmbeddingData({
      title: bookmark.title,
      description: bookmark.description,
      url: bookmark.url,
      folder: bookmark.folder,
      tags: bookmark.tags,
      aiSummary: bookmark.aiSummary?.status === "generated" ? bookmark.aiSummary.text : "",
    });
    if (embeddingData) {
      bookmark.embedding = embeddingData.embedding;
      bookmark.embeddingModel = embeddingData.embeddingModel;
      bookmark.embeddingContentHash = embeddingData.embeddingContentHash;
      bookmark.embeddingUpdatedAt = embeddingData.embeddingUpdatedAt;
    }
  } catch (err) {
    logger.warn("ai_controller.embedding_refresh_failed", {
      bookmarkId: String(bookmark._id),
      message: err?.message,
    });
  }
}

// @desc  Extract webpage metadata preview for a URL before saving a bookmark
// @route POST /api/bookmarks/extract-preview
const extractUrlPreview = async (req, res) => {
  try {
    const { url } = req.body || {};
    const result = await extractWebpageMetadata(url);
    return res.status(200).json({
      metadata: result.metadata,
      finalUrl: result.finalUrl,
      fromCache: Boolean(result.fromCache),
    });
  } catch (error) {
    return handleAiError(res, error, "Failed to extract webpage metadata preview.");
  }
};

// @desc  Retrieve AI insights for a bookmark
// @route GET /api/bookmarks/:id/ai-insights
const getAiInsights = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid bookmark ID" });
    }

    const bookmark = await Bookmark.findOne({ _id: req.params.id, user: req.user._id });
    if (!bookmark) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    const clean = sanitizeBookmark(bookmark);
    return res.status(200).json({
      bookmarkId: clean._id,
      processingStatus: clean.processingStatus || "idle",
      lastProcessedAt: clean.lastProcessedAt || null,
      extractedMetadata: clean.extractedMetadata || {},
      aiSummary: clean.aiSummary || { text: "", status: "idle" },
      suggestedTags: clean.suggestedTags || [],
      suggestedFolder: clean.suggestedFolder || { status: "none" },
      aiProcessingError: clean.aiProcessingError || null,
    });
  } catch (error) {
    return handleAiError(res, error, "Failed to retrieve bookmark AI insights.");
  }
};

// @desc  Check AI processing status for a bookmark
// @route GET /api/bookmarks/:id/processing-status
const getProcessingStatus = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid bookmark ID" });
    }

    const bookmark = await Bookmark.findOne({ _id: req.params.id, user: req.user._id }).select(
      "processingStatus lastProcessedAt aiProcessingError"
    );
    if (!bookmark) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    return res.status(200).json({
      bookmarkId: bookmark._id,
      processingStatus: bookmark.processingStatus || "idle",
      inFlight: defaultProcessingQueue.isProcessing(bookmark._id),
      lastProcessedAt: bookmark.lastProcessedAt || null,
      aiProcessingError: bookmark.aiProcessingError || null,
    });
  } catch (error) {
    return handleAiError(res, error, "Failed to check AI processing status.");
  }
};

// @desc  Trigger or retry full background AI processing for a bookmark
// @route POST /api/bookmarks/:id/process
const triggerBookmarkProcessing = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid bookmark ID" });
    }

    const bookmark = await Bookmark.findOne({ _id: req.params.id, user: req.user._id });
    if (!bookmark) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    const force = req.body?.force !== false;
    const bypassCache = Boolean(req.body?.bypassCache);

    await Bookmark.updateOne(
      { _id: bookmark._id, user: req.user._id },
      { $set: { processingStatus: "pending", aiProcessingError: null } }
    );

    const { queued, deduplicated } = defaultProcessingQueue.enqueue(bookmark._id, req.user._id, {
      force,
      bypassCache,
    });

    return res.status(202).json({
      bookmarkId: bookmark._id,
      processingStatus: "pending",
      queued,
      deduplicated,
      message: deduplicated
        ? "AI processing is already in progress for this bookmark."
        : "AI processing has been queued.",
    });
  } catch (error) {
    return handleAiError(res, error, "Failed to trigger AI processing.");
  }
};

// @desc  Trigger webpage metadata extraction for an existing bookmark
// @route POST /api/bookmarks/:id/extract
const extractBookmarkMetadata = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid bookmark ID" });
    }

    const bookmark = await Bookmark.findOne({ _id: req.params.id, user: req.user._id });
    if (!bookmark) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    const bypassCache = Boolean(req.body?.bypassCache);
    const result = await extractWebpageMetadata(bookmark.url, { bypassCache });

    bookmark.extractedMetadata = result.metadata;
    bookmark.lastProcessedAt = new Date();
    const saved = await bookmark.save();

    return res.status(200).json({
      bookmark: sanitizeBookmark(saved),
      extractedMetadata: saved.extractedMetadata,
      fromCache: Boolean(result.fromCache),
    });
  } catch (error) {
    return handleAiError(res, error, "Failed to extract webpage metadata.");
  }
};

// @desc  Regenerate AI summary for a bookmark
// @route POST /api/bookmarks/:id/summary/regenerate
const regenerateBookmarkSummary = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid bookmark ID" });
    }

    const bookmark = await Bookmark.findOne({ _id: req.params.id, user: req.user._id }).select(
      "+embedding +embeddingContentHash"
    );
    if (!bookmark) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    const extractedMetadata = bookmark.extractedMetadata?.toObject?.() || bookmark.extractedMetadata || {};
    const summaryObj = await generateBookmarkSummary({
      bookmark,
      extractedMetadata,
      extractedText: extractedMetadata.textPreview || "",
    });

    bookmark.aiSummary = summaryObj;
    bookmark.lastProcessedAt = new Date();
    await refreshBookmarkEmbeddingSafe(bookmark);
    const saved = await bookmark.save();

    return res.status(200).json({
      bookmark: sanitizeBookmark(saved),
      aiSummary: saved.aiSummary,
    });
  } catch (error) {
    return handleAiError(res, error, "Failed to regenerate AI summary.");
  }
};

// @desc  Generate fresh structured tag suggestions for a bookmark
// @route POST /api/bookmarks/:id/tags/suggest
const suggestBookmarkTags = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid bookmark ID" });
    }

    const bookmark = await Bookmark.findOne({ _id: req.params.id, user: req.user._id });
    if (!bookmark) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    const existingUserTags = await Bookmark.distinct("tags", { user: req.user._id });
    const extractedMetadata = bookmark.extractedMetadata?.toObject?.() || bookmark.extractedMetadata || {};

    const suggestedTags = await generateTagSuggestions({
      bookmark,
      extractedMetadata,
      extractedText: extractedMetadata.textPreview || "",
      summary: bookmark.aiSummary?.text || "",
      existingUserTags,
    });

    bookmark.suggestedTags = suggestedTags;
    bookmark.lastProcessedAt = new Date();
    const saved = await bookmark.save();

    return res.status(200).json({
      bookmark: sanitizeBookmark(saved),
      suggestedTags: saved.suggestedTags,
    });
  } catch (error) {
    return handleAiError(res, error, "Failed to generate tag suggestions.");
  }
};

// @desc  Accept, reject, or edit suggested tags without overwriting existing user tags
// @route PATCH /api/bookmarks/:id/tags/suggestions
const respondToTagSuggestions = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid bookmark ID" });
    }

    const { action, tag, editedTag, tags } = req.body || {};
    const validActions = new Set(["accept", "reject", "accept_all", "reject_all"]);
    if (!validActions.has(action)) {
      return res.status(400).json({
        message: "Action must be one of: accept, reject, accept_all, reject_all.",
      });
    }

    const bookmark = await Bookmark.findOne({ _id: req.params.id, user: req.user._id }).select(
      "+embedding +embeddingContentHash"
    );
    if (!bookmark) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    const currentSuggestions = Array.isArray(bookmark.suggestedTags) ? bookmark.suggestedTags : [];
    const tagsToAdd = [];

    if (action === "accept_all") {
      for (const item of currentSuggestions) {
        if (item.status === "pending") {
          item.status = "accepted";
          tagsToAdd.push(item.name);
        }
      }
    } else if (action === "reject_all") {
      for (const item of currentSuggestions) {
        if (item.status === "pending") {
          item.status = "rejected";
        }
      }
    } else {
      const targetNames = Array.isArray(tags) ? tags : tag ? [tag] : [];
      if (targetNames.length === 0) {
        return res.status(400).json({ message: "A tag name is required for accept or reject." });
      }

      const targetKeys = new Set(targetNames.map(normalizeTagKey).filter(Boolean));
      let matchedAny = false;

      for (const item of currentSuggestions) {
        if (targetKeys.has(item.normalized) || targetKeys.has(normalizeTagKey(item.name))) {
          matchedAny = true;
          if (action === "accept") {
            const finalName =
              typeof editedTag === "string" && editedTag.trim()
                ? formatTagDisplay(editedTag)
                : item.name;
            item.name = finalName || item.name;
            item.normalized = normalizeTagKey(item.name);
            item.status = "accepted";
            tagsToAdd.push(item.name);
          } else {
            item.status = "rejected";
          }
        }
      }

      if (!matchedAny) {
        return res.status(404).json({ message: "Suggested tag not found on this bookmark." });
      }
    }

    // Never overwrite existing user-selected tags; only append unique accepted tags
    if (tagsToAdd.length > 0) {
      bookmark.tags = mergeUniqueTags(bookmark.tags, tagsToAdd);
      await refreshBookmarkEmbeddingSafe(bookmark);
    }

    const saved = await bookmark.save();
    return res.status(200).json({
      bookmark: sanitizeBookmark(saved),
      tags: saved.tags,
      suggestedTags: saved.suggestedTags,
    });
  } catch (error) {
    return handleAiError(res, error, "Failed to update tag suggestions.");
  }
};

// @desc  Generate folder recommendation for a bookmark
// @route POST /api/bookmarks/:id/folder/recommend
const recommendBookmarkFolder = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid bookmark ID" });
    }

    const bookmark = await Bookmark.findOne({ _id: req.params.id, user: req.user._id });
    if (!bookmark) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    const userFolders = await Folder.find({ user: req.user._id }).select("name description").lean();
    const extractedMetadata = bookmark.extractedMetadata?.toObject?.() || bookmark.extractedMetadata || {};

    const recommendation = await generateFolderRecommendation({
      bookmark,
      extractedMetadata,
      extractedText: extractedMetadata.textPreview || "",
      summary: bookmark.aiSummary?.text || "",
      existingFolders: userFolders,
    });

    bookmark.suggestedFolder = recommendation;
    bookmark.lastProcessedAt = new Date();
    const saved = await bookmark.save();

    return res.status(200).json({
      bookmark: sanitizeBookmark(saved),
      suggestedFolder: saved.suggestedFolder,
    });
  } catch (error) {
    return handleAiError(res, error, "Failed to generate folder recommendation.");
  }
};

// @desc  Accept or reject the AI folder recommendation (never moves without explicit user approval)
// @route PATCH /api/bookmarks/:id/folder/recommendation
const respondToFolderRecommendation = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid bookmark ID" });
    }

    const { action, folderName } = req.body || {};
    if (action !== "accept" && action !== "reject") {
      return res.status(400).json({ message: "Action must be 'accept' or 'reject'." });
    }

    const bookmark = await Bookmark.findOne({ _id: req.params.id, user: req.user._id }).select(
      "+embedding +embeddingContentHash"
    );
    if (!bookmark) {
      return res.status(404).json({ message: "Bookmark not found" });
    }

    const currentRec = bookmark.suggestedFolder;
    if (!currentRec || !currentRec.name || currentRec.status === "none") {
      return res.status(400).json({ message: "No folder recommendation is available for this bookmark." });
    }

    if (action === "accept") {
      const targetName =
        typeof folderName === "string" && folderName.trim()
          ? folderName.trim().slice(0, 60)
          : currentRec.name;

      // Ensure folder exists without creating case-insensitive duplicates
      const folderDoc = await ensureFolderCaseInsensitive(req.user._id, targetName);
      const canonicalFolderName = folderDoc ? folderDoc.name : targetName;

      bookmark.folder = canonicalFolderName;
      bookmark.suggestedFolder = {
        ...currentRec.toObject?.(),
        name: canonicalFolderName,
        isNewFolder: false,
        status: "accepted",
        updatedAt: new Date(),
      };
      await refreshBookmarkEmbeddingSafe(bookmark);
    } else {
      bookmark.suggestedFolder = {
        ...currentRec.toObject?.(),
        status: "rejected",
        updatedAt: new Date(),
      };
    }

    const saved = await bookmark.save();
    return res.status(200).json({
      bookmark: sanitizeBookmark(saved),
      folder: saved.folder,
      suggestedFolder: saved.suggestedFolder,
    });
  } catch (error) {
    return handleAiError(res, error, "Failed to update folder recommendation.");
  }
};

module.exports = {
  extractUrlPreview,
  getAiInsights,
  getProcessingStatus,
  triggerBookmarkProcessing,
  extractBookmarkMetadata,
  regenerateBookmarkSummary,
  suggestBookmarkTags,
  respondToTagSuggestions,
  recommendBookmarkFolder,
  respondToFolderRecommendation,
};
