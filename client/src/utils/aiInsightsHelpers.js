export const ACTIVE_PROCESSING_STATUSES = new Set(["pending", "extracting", "analyzing"]);

export function isProcessingActive(status) {
  return ACTIVE_PROCESSING_STATUSES.has(status);
}

export function getProcessingStatusMeta(status) {
  switch (status) {
    case "pending":
      return {
        label: "AI queued",
        tone: "info",
        active: true,
      };
    case "extracting":
      return {
        label: "Reading page...",
        tone: "info",
        active: true,
      };
    case "analyzing":
      return {
        label: "Analyzing...",
        tone: "ai",
        active: true,
      };
    case "completed":
      return {
        label: "AI ready",
        tone: "success",
        active: false,
      };
    case "partial":
      return {
        label: "Partial AI",
        tone: "warning",
        active: false,
      };
    case "failed":
      return {
        label: "AI failed",
        tone: "error",
        active: false,
      };
    default:
      return {
        label: "Not analyzed",
        tone: "neutral",
        active: false,
      };
  }
}

export function getPendingSuggestedTags(bookmark) {
  const list = Array.isArray(bookmark?.suggestedTags) ? bookmark.suggestedTags : [];
  return list.filter((item) => item && item.status === "pending" && item.name);
}

export function getPendingFolderRecommendation(bookmark) {
  const rec = bookmark?.suggestedFolder;
  if (!rec || rec.status !== "pending" || !rec.name) {
    return null;
  }
  if (
    bookmark?.folder &&
    rec.name.trim().toLowerCase() === bookmark.folder.trim().toLowerCase()
  ) {
    return null;
  }
  return rec;
}

export function getDisplaySummary(bookmark) {
  const summary = bookmark?.aiSummary;
  if (!summary || !summary.text) return null;
  if (summary.status === "generated" || summary.status === "fallback") {
    return {
      text: summary.text,
      isFallback: summary.status === "fallback",
      provider: summary.provider || "",
      model: summary.model || "",
      updatedAt: summary.updatedAt || null,
    };
  }
  return null;
}

export function applyTagSuggestionResponse(bookmark, { action, tag, editedTag }) {
  const existingTags = Array.isArray(bookmark?.tags) ? [...bookmark.tags] : [];
  const existingKeys = new Set(existingTags.map((t) => t.trim().toLowerCase()));
  const nextSuggested = (bookmark?.suggestedTags || []).map((item) => {
    const matches =
      action === "accept_all" ||
      action === "reject_all" ||
      item.name.toLowerCase() === String(tag || "").toLowerCase() ||
      item.normalized === String(tag || "").toLowerCase();

    if (!matches || item.status !== "pending") return item;

    if (action === "accept" || action === "accept_all") {
      const finalName =
        action === "accept" && editedTag && editedTag.trim() ? editedTag.trim() : item.name;
      if (!existingKeys.has(finalName.toLowerCase())) {
        existingKeys.add(finalName.toLowerCase());
        existingTags.push(finalName);
      }
      return { ...item, name: finalName, status: "accepted" };
    }

    return { ...item, status: "rejected" };
  });

  return {
    ...bookmark,
    tags: existingTags,
    suggestedTags: nextSuggested,
  };
}

export function applyFolderRecommendationResponse(bookmark, { action, folderName }) {
  const rec = bookmark?.suggestedFolder;
  if (!rec || !rec.name) return bookmark;

  if (action === "accept") {
    const nextFolder = folderName && folderName.trim() ? folderName.trim() : rec.name;
    return {
      ...bookmark,
      folder: nextFolder,
      suggestedFolder: {
        ...rec,
        name: nextFolder,
        isNewFolder: false,
        status: "accepted",
      },
    };
  }

  return {
    ...bookmark,
    suggestedFolder: {
      ...rec,
      status: "rejected",
    },
  };
}
