import test from "node:test";
import assert from "node:assert/strict";

import {
  isProcessingActive,
  getProcessingStatusMeta,
  getPendingSuggestedTags,
  getPendingFolderRecommendation,
  getDisplaySummary,
  applyTagSuggestionResponse,
  applyFolderRecommendationResponse,
} from "./aiInsightsHelpers.js";

test("processing status helpers classify active, completed, partial, and error states", () => {
  assert.equal(isProcessingActive("pending"), true);
  assert.equal(isProcessingActive("extracting"), true);
  assert.equal(isProcessingActive("analyzing"), true);
  assert.equal(isProcessingActive("completed"), false);
  assert.equal(isProcessingActive("failed"), false);

  assert.equal(getProcessingStatusMeta("analyzing").label, "Analyzing...");
  assert.equal(getProcessingStatusMeta("failed").tone, "error");
  assert.equal(getProcessingStatusMeta("partial").tone, "warning");
});

test("AI insights rendering helpers filter pending tags, folder recommendations, and summary", () => {
  const bookmark = {
    folder: "Personal",
    tags: ["react"],
    aiSummary: {
      text: "A guide to React Hooks for state management.",
      status: "generated",
      provider: "gemini",
    },
    suggestedTags: [
      { name: "Frontend", normalized: "frontend", status: "pending" },
      { name: "Hooks", normalized: "hooks", status: "accepted" },
      { name: "Noise", normalized: "noise", status: "rejected" },
    ],
    suggestedFolder: {
      name: "Web Development",
      isNewFolder: false,
      reason: "Matches React frontend topics.",
      status: "pending",
    },
  };

  assert.equal(getDisplaySummary(bookmark).text, "A guide to React Hooks for state management.");
  assert.deepEqual(
    getPendingSuggestedTags(bookmark).map((t) => t.name),
    ["Frontend"]
  );
  assert.equal(getPendingFolderRecommendation(bookmark).name, "Web Development");

  // Already in the recommended folder => hide redundant banner
  assert.equal(
    getPendingFolderRecommendation({ ...bookmark, folder: "Web Development" }),
    null
  );
});

test("accepting and rejecting tag suggestions preserves user tags and avoids duplicates", () => {
  const bookmark = {
    tags: ["React"],
    suggestedTags: [
      { name: "Frontend", normalized: "frontend", status: "pending" },
      { name: "JavaScript", normalized: "javascript", status: "pending" },
    ],
  };

  const accepted = applyTagSuggestionResponse(bookmark, {
    action: "accept",
    tag: "Frontend",
    editedTag: "Web Frontend",
  });
  assert.deepEqual(accepted.tags, ["React", "Web Frontend"]);
  assert.equal(accepted.suggestedTags[0].status, "accepted");
  assert.equal(accepted.suggestedTags[1].status, "pending");

  const rejected = applyTagSuggestionResponse(accepted, {
    action: "reject",
    tag: "JavaScript",
  });
  assert.deepEqual(rejected.tags, ["React", "Web Frontend"]);
  assert.equal(rejected.suggestedTags[1].status, "rejected");
});

test("accepting and rejecting folder recommendations updates folder only on explicit approval", () => {
  const bookmark = {
    folder: "Personal",
    suggestedFolder: {
      name: "Web Development",
      isNewFolder: true,
      reason: "Frontend guide",
      status: "pending",
    },
  };

  const rejected = applyFolderRecommendationResponse(bookmark, { action: "reject" });
  assert.equal(rejected.folder, "Personal");
  assert.equal(rejected.suggestedFolder.status, "rejected");

  const accepted = applyFolderRecommendationResponse(bookmark, { action: "accept" });
  assert.equal(accepted.folder, "Web Development");
  assert.equal(accepted.suggestedFolder.status, "accepted");
  assert.equal(accepted.suggestedFolder.isNewFolder, false);
});
