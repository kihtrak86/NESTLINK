const { extractWebpageMetadata } = require("./metadataExtractorService");
const {
  generateAllBookmarkInsights,
  generateBookmarkSummary,
  generateTagSuggestions,
  generateFolderRecommendation,
} = require("./aiInsightsService");
const { generateBookmarkEmbeddingData } = require("./embeddingService");
const {
  buildBookmarkEmbeddingText,
  computeContentHash,
  isValidEmbedding,
} = require("../utils/embeddingText");
const logger = require("../utils/logger");

const DEFAULT_MAX_RETRIES = 2;

function computeProcessingContentHash({ url = "", title = "", description = "", extractedText = "" }) {
  return computeContentHash(
    [
      String(url).trim(),
      String(title).trim(),
      String(description).trim(),
      String(extractedText).slice(0, 4000).trim(),
    ].join("||")
  );
}

/**
 * In-process background AI processing coordinator compatible with Render single-service deployments.
 * Uses a single combined LLM call per bookmark by default to conserve free-tier RPM/RPD quota.
 */
class BookmarkProcessingQueue {
  constructor(deps = {}) {
    this.inFlight = new Map(); // bookmarkId -> Promise
    this.cancelled = new Set(); // bookmarkIds deleted while processing
    this.deps = deps;
  }

  isProcessing(bookmarkId) {
    return this.inFlight.has(String(bookmarkId));
  }

  cancelBookmark(bookmarkId) {
    this.cancelled.add(String(bookmarkId));
  }

  /**
   * Schedules background processing without blocking the HTTP response.
   * Deduplicates concurrent requests for the same bookmark ID.
   */
  enqueue(bookmarkId, userId, options = {}) {
    const key = String(bookmarkId);
    if (this.inFlight.has(key)) {
      logger.info("pipeline.duplicate_skipped", { bookmarkId: key });
      return { queued: false, deduplicated: true, promise: this.inFlight.get(key) };
    }

    this.cancelled.delete(key);

    const promise = new Promise((resolve) => {
      setImmediate(async () => {
        try {
          const result = await this.processBookmark(bookmarkId, userId, options);
          resolve(result);
        } catch (err) {
          logger.error("pipeline.unhandled_error", { bookmarkId: key, error: err });
          resolve({ status: "failed", error: err?.message || "Processing failed" });
        } finally {
          this.inFlight.delete(key);
          this.cancelled.delete(key);
        }
      });
    });

    this.inFlight.set(key, promise);
    return { queued: true, deduplicated: false, promise };
  }

  async _runWithRetry(fn, maxRetries = DEFAULT_MAX_RETRIES) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return { value: await fn(), retries: attempt };
      } catch (err) {
        lastError = err;
        const nonRetryable = new Set([
          "INVALID_URL",
          "INVALID_PROTOCOL",
          "SSRF_BLOCKED",
          "UNSUPPORTED_CONTENT_TYPE",
          "RESPONSE_TOO_LARGE",
          "LLM_NOT_CONFIGURED",
          "UNSUPPORTED_LLM_PROVIDER",
        ]);
        if (nonRetryable.has(err?.code) || attempt === maxRetries) {
          throw err;
        }
        const delayMs = this.deps.retryDelayMs ?? Math.min(1000 * 2 ** attempt, 4000);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastError;
  }

  /**
   * Executes the full Phase 2 pipeline for a single user-owned bookmark.
   */
  async processBookmark(
    bookmarkId,
    userId,
    { force = false, bypassCache = false, maxRetries = DEFAULT_MAX_RETRIES } = {}
  ) {
    const key = String(bookmarkId);
    const BookmarkModel = this.deps.BookmarkModel || require("../models/Bookmark");
    const FolderModel = this.deps.FolderModel || require("../models/Folder");
    const extractFn = this.deps.extractWebpageMetadata || extractWebpageMetadata;
    const embedFn = this.deps.generateBookmarkEmbeddingData || generateBookmarkEmbeddingData;

    const hasCustomIndividualStages = Boolean(
      this.deps.generateBookmarkSummary ||
        this.deps.generateTagSuggestions ||
        this.deps.generateFolderRecommendation
    );
    const useCombinedMode =
      Boolean(this.deps.generateAllBookmarkInsights) ||
      (!hasCustomIndividualStages && process.env.AI_COMBINED_PROMPT !== "false");

    const combinedFn = this.deps.generateAllBookmarkInsights || generateAllBookmarkInsights;
    const summaryFn = this.deps.generateBookmarkSummary || generateBookmarkSummary;
    const tagsFn = this.deps.generateTagSuggestions || generateTagSuggestions;
    const folderFn = this.deps.generateFolderRecommendation || generateFolderRecommendation;

    const bookmark = await BookmarkModel.findOne({ _id: bookmarkId, user: userId }).select(
      "+embedding +embeddingContentHash"
    );
    if (!bookmark || this.cancelled.has(key)) {
      return { status: "skipped", reason: "bookmark_not_found_or_deleted" };
    }

    await BookmarkModel.updateOne(
      { _id: bookmarkId, user: userId },
      {
        $set: {
          processingStatus: "extracting",
          aiProcessingError: null,
        },
      }
    );

    const errors = [];
    let extractedMetadata =
      bookmark.extractedMetadata?.toObject?.() || bookmark.extractedMetadata || {};
    let extractedText = extractedMetadata.textPreview || "";
    let extractionSucceeded = false;

    // Stage 1: Metadata & Content Extraction
    try {
      const { value: extracted } = await this._runWithRetry(
        () => extractFn(bookmark.url, { bypassCache }),
        maxRetries
      );
      extractedMetadata = extracted.metadata;
      extractedText = extracted.extractedText;
      extractionSucceeded = true;
    } catch (err) {
      errors.push({
        stage: "extraction",
        message: err?.publicMessage || "Could not extract webpage metadata.",
      });
      logger.warn("pipeline.extraction_failed", {
        bookmarkId: key,
        code: err?.code,
        message: err?.message,
      });
    }

    if (this.cancelled.has(key)) {
      return { status: "cancelled" };
    }

    const nextContentHash = computeProcessingContentHash({
      url: bookmark.url,
      title: bookmark.title,
      description: bookmark.description,
      extractedText,
    });

    if (
      !force &&
      bookmark.processingStatus === "completed" &&
      bookmark.contentHash &&
      bookmark.contentHash === nextContentHash &&
      bookmark.aiSummary?.text
    ) {
      await BookmarkModel.updateOne(
        { _id: bookmarkId, user: userId },
        { $set: { processingStatus: "completed" } }
      );
      logger.info("pipeline.unchanged_skipped", { bookmarkId: key });
      return { status: "completed", skippedAi: true };
    }

    await BookmarkModel.updateOne(
      { _id: bookmarkId, user: userId },
      {
        $set: {
          processingStatus: "analyzing",
          ...(extractionSucceeded ? { extractedMetadata } : {}),
        },
      }
    );

    const [existingUserTags, userFolders] = await Promise.all([
      BookmarkModel.distinct("tags", { user: userId }),
      FolderModel.find({ user: userId }).select("name description").lean(),
    ]);

    const updateSet = {
      ...(extractionSucceeded ? { extractedMetadata } : {}),
      contentHash: nextContentHash,
      lastProcessedAt: new Date(),
    };

    let summarySucceeded = false;
    let tagsSucceeded = false;
    let folderSucceeded = false;

    if (useCombinedMode) {
      // Single-call combined LLM analysis (3x higher free-tier daily throughput)
      try {
        const { value: insights } = await this._runWithRetry(
          () =>
            combinedFn({
              bookmark,
              extractedMetadata,
              extractedText,
              existingUserTags,
              existingFolders: userFolders,
            }),
          maxRetries
        );
        if (insights?.aiSummary) {
          updateSet.aiSummary = insights.aiSummary;
          summarySucceeded = true;
        }
        if (Array.isArray(insights?.suggestedTags)) {
          updateSet.suggestedTags = insights.suggestedTags;
          tagsSucceeded = true;
        }
        if (insights?.suggestedFolder) {
          updateSet.suggestedFolder = insights.suggestedFolder;
          folderSucceeded = true;
        }
      } catch (err) {
        errors.push({
          stage: "analysis",
          message: err?.publicMessage || "AI bookmark analysis failed.",
        });
        updateSet.aiSummary = {
          text: bookmark.aiSummary?.text || "",
          status: "failed",
          provider: "",
          model: "",
          updatedAt: new Date(),
        };
        logger.warn("pipeline.combined_analysis_failed", {
          bookmarkId: key,
          message: err?.message,
        });
      }
    } else {
      // Stage 2: AI Summary
      let generatedSummaryText = bookmark.aiSummary?.text || "";
      try {
        const { value: summaryObj } = await this._runWithRetry(
          () => summaryFn({ bookmark, extractedMetadata, extractedText }),
          maxRetries
        );
        updateSet.aiSummary = summaryObj;
        generatedSummaryText = summaryObj.text;
        summarySucceeded = true;
      } catch (err) {
        errors.push({
          stage: "summary",
          message: err?.publicMessage || "AI summary generation failed.",
        });
        updateSet.aiSummary = {
          text: bookmark.aiSummary?.text || "",
          status: "failed",
          provider: "",
          model: "",
          updatedAt: new Date(),
        };
        logger.warn("pipeline.summary_failed", { bookmarkId: key, message: err?.message });
      }

      // Stage 3: Tag Suggestions
      try {
        const { value: suggestedTags } = await this._runWithRetry(
          () =>
            tagsFn({
              bookmark,
              extractedMetadata,
              extractedText,
              summary: generatedSummaryText,
              existingUserTags,
            }),
          maxRetries
        );
        updateSet.suggestedTags = suggestedTags;
        tagsSucceeded = true;
      } catch (err) {
        errors.push({
          stage: "tags",
          message: err?.publicMessage || "AI tag suggestion failed.",
        });
        logger.warn("pipeline.tags_failed", { bookmarkId: key, message: err?.message });
      }

      // Stage 4: Folder Recommendation
      try {
        const { value: suggestedFolder } = await this._runWithRetry(
          () =>
            folderFn({
              bookmark,
              extractedMetadata,
              extractedText,
              summary: generatedSummaryText,
              existingFolders: userFolders,
            }),
          maxRetries
        );
        updateSet.suggestedFolder = suggestedFolder;
        folderSucceeded = true;
      } catch (err) {
        errors.push({
          stage: "folder",
          message: err?.publicMessage || "AI folder recommendation failed.",
        });
        logger.warn("pipeline.folder_failed", { bookmarkId: key, message: err?.message });
      }
    }

    // Stage 5: Refresh 384-dim embedding only if enriched embedding text changed
    try {
      const enrichedFields = {
        title: bookmark.title,
        description: bookmark.description,
        url: bookmark.url,
        folder: bookmark.folder,
        tags: bookmark.tags,
        aiSummary: updateSet.aiSummary?.status === "generated" ? updateSet.aiSummary.text : "",
      };
      const nextEmbText = buildBookmarkEmbeddingText(enrichedFields);
      const nextEmbHash = computeContentHash(nextEmbText);

      if (!isValidEmbedding(bookmark.embedding) || bookmark.embeddingContentHash !== nextEmbHash) {
        const embeddingData = await embedFn(enrichedFields);
        if (embeddingData) {
          updateSet.embedding = embeddingData.embedding;
          updateSet.embeddingModel = embeddingData.embeddingModel;
          updateSet.embeddingContentHash = embeddingData.embeddingContentHash;
          updateSet.embeddingUpdatedAt = embeddingData.embeddingUpdatedAt;
        }
      }
    } catch (err) {
      logger.warn("pipeline.embedding_refresh_failed", { bookmarkId: key, message: err?.message });
    }

    const aiSuccessCount = Number(summarySucceeded) + Number(tagsSucceeded) + Number(folderSucceeded);
    let finalStatus = "completed";
    if (errors.length > 0) {
      finalStatus = extractionSucceeded || aiSuccessCount > 0 ? "partial" : "failed";
      updateSet.aiProcessingError = {
        stage: errors[0].stage,
        message: errors.map((e) => e.message).join(" "),
        retryCount: (bookmark.aiProcessingError?.retryCount || 0) + 1,
        occurredAt: new Date(),
      };
    } else {
      updateSet.aiProcessingError = null;
    }
    updateSet.processingStatus = finalStatus;

    if (this.cancelled.has(key)) {
      return { status: "cancelled" };
    }

    const writeRes = await BookmarkModel.updateOne(
      { _id: bookmarkId, user: userId },
      { $set: updateSet }
    );

    if (writeRes && writeRes.matchedCount === 0) {
      return { status: "skipped", reason: "bookmark_deleted_during_processing" };
    }

    logger.info("pipeline.finished", {
      bookmarkId: key,
      status: finalStatus,
      combinedMode: useCombinedMode,
      errorCount: errors.length,
    });

    return { status: finalStatus, errors };
  }
}

const defaultProcessingQueue = new BookmarkProcessingQueue();

module.exports = {
  BookmarkProcessingQueue,
  defaultProcessingQueue,
  computeProcessingContentHash,
};
