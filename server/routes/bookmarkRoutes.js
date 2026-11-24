const express = require("express");
const router = express.Router();
const {
  getBookmarks,
  semanticSearchBookmarks,
  getTags,
  createBookmark,
  updateBookmark,
  deleteBookmark,
} = require("../controllers/bookmarkController");
const {
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
} = require("../controllers/aiInsightsController");
const { protect } = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimit");

const aiOperationLimiter = createRateLimiter({
  windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS || "60000", 10) || 60000,
  maxRequests: parseInt(process.env.AI_RATE_LIMIT_MAX_REQUESTS || "20", 10) || 20,
  message: "Rate limit exceeded for AI analysis requests. Please wait a minute and try again.",
});

const extractOperationLimiter = createRateLimiter({
  windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS || "60000", 10) || 60000,
  maxRequests: parseInt(process.env.EXTRACT_RATE_LIMIT_MAX_REQUESTS || "30", 10) || 30,
  message: "Rate limit exceeded for webpage metadata extraction. Please wait a minute and try again.",
});

router.use(protect);

// Phase 1 routes
router.get("/semantic-search", semanticSearchBookmarks);
router.get("/tags", getTags);

// Phase 2 pre-save URL metadata preview
router.post("/extract-preview", extractOperationLimiter, extractUrlPreview);

// Phase 1 CRUD routes
router.route("/").get(getBookmarks).post(createBookmark);
router.route("/:id").put(updateBookmark).delete(deleteBookmark);

// Phase 2 per-bookmark AI insights & suggestion routes
router.get("/:id/ai-insights", getAiInsights);
router.get("/:id/processing-status", getProcessingStatus);
router.post("/:id/process", aiOperationLimiter, triggerBookmarkProcessing);
router.post("/:id/extract", extractOperationLimiter, extractBookmarkMetadata);
router.post("/:id/summary/regenerate", aiOperationLimiter, regenerateBookmarkSummary);
router.post("/:id/tags/suggest", aiOperationLimiter, suggestBookmarkTags);
router.patch("/:id/tags/suggestions", respondToTagSuggestions);
router.post("/:id/folder/recommend", aiOperationLimiter, recommendBookmarkFolder);
router.patch("/:id/folder/recommendation", respondToFolderRecommendation);

module.exports = router;
