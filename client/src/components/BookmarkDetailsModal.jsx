import { useState, useEffect } from "react";
import ProcessingStatusBadge from "./ProcessingStatusBadge";
import { badgeStyle, colorFor } from "../utils/colors";
import {
  triggerBookmarkProcessing,
  regenerateBookmarkSummary,
  suggestBookmarkTags,
  recommendBookmarkFolder,
} from "../services/api";
import {
  getDisplaySummary,
  getPendingSuggestedTags,
  isProcessingActive,
} from "../utils/aiInsightsHelpers";

function formatDateTime(dateStr) {
  if (!dateStr) return "";
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function BookmarkDetailsModal({
  bookmark,
  isOpen,
  onClose,
  onBookmarkUpdated,
  onRespondTag,
  onRespondFolder,
}) {
  const [busyAction, setBusyAction] = useState("");
  const [actionError, setActionError] = useState("");
  const [editingTagKey, setEditingTagKey] = useState("");
  const [editedTagValue, setEditedTagValue] = useState("");

  useEffect(() => {
    setBusyAction("");
    setActionError("");
    setEditingTagKey("");
    setEditedTagValue("");
  }, [bookmark?._id, isOpen]);

  if (!isOpen || !bookmark) return null;

  const meta = bookmark.extractedMetadata || {};
  const summary = getDisplaySummary(bookmark);
  const pendingTags = getPendingSuggestedTags(bookmark);
  const suggestedFolder = bookmark.suggestedFolder || {};
  const processing = isProcessingActive(bookmark.processingStatus);

  const runAction = async (key, fn) => {
    setBusyAction(key);
    setActionError("");
    try {
      await fn();
    } catch (err) {
      setActionError(
        err?.response?.data?.message || "Action failed. Please try again in a moment."
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleFullReprocess = () =>
    runAction("process", async () => {
      await triggerBookmarkProcessing(bookmark._id, { force: true, bypassCache: true });
      onBookmarkUpdated({
        ...bookmark,
        processingStatus: "pending",
        aiProcessingError: null,
      });
    });

  const handleRegenerateSummary = () =>
    runAction("summary", async () => {
      const data = await regenerateBookmarkSummary(bookmark._id);
      if (data?.bookmark) onBookmarkUpdated(data.bookmark);
    });

  const handleRegenerateTags = () =>
    runAction("tags", async () => {
      const data = await suggestBookmarkTags(bookmark._id);
      if (data?.bookmark) onBookmarkUpdated(data.bookmark);
    });

  const handleRegenerateFolder = () =>
    runAction("folder", async () => {
      const data = await recommendBookmarkFolder(bookmark._id);
      if (data?.bookmark) onBookmarkUpdated(data.bookmark);
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="surface bg-white dark:bg-[#0a0a0a] w-full max-w-2xl p-6 sm:p-7 shadow-pop dark:shadow-none animate-scale-in max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Bookmark details and AI insights"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="chip">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: colorFor(bookmark.folder) }}
                />
                {bookmark.folder}
              </span>
              <ProcessingStatusBadge
                status={bookmark.processingStatus}
                showIdle
                showCompleted
              />
            </div>
            <h2 className="text-xl font-semibold tracking-tight break-words">{bookmark.title}</h2>
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#0070f3] dark:text-[#52a8ff] hover:underline break-all"
            >
              {bookmark.url}
            </a>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white text-xl leading-none flex-shrink-0"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {actionError && <div className="notice mb-4">{actionError}</div>}

        {bookmark.aiProcessingError?.message && (
          <div className="mb-4 rounded-lg border border-[#f76b15]/30 bg-[#f76b15]/10 px-3.5 py-2.5 text-xs text-[#cc4e00] dark:text-[#ff8b3e] flex items-center justify-between gap-3">
            <span>{bookmark.aiProcessingError.message}</span>
            <button
              type="button"
              onClick={handleFullReprocess}
              disabled={Boolean(busyAction) || processing}
              className="font-semibold underline whitespace-nowrap disabled:opacity-40"
            >
              Retry
            </button>
          </div>
        )}

        {/* AI Insights Header Bar */}
        <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-[#ebebeb] dark:border-[#242424]">
          <div>
            <h3 className="text-sm font-semibold">AI Insights</h3>
            <p className="text-xs text-[#666] dark:text-[#a1a1a1]">
              {bookmark.lastProcessedAt
                ? `Last analyzed ${formatDateTime(bookmark.lastProcessedAt)}`
                : "Not analyzed yet"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleFullReprocess}
            disabled={Boolean(busyAction) || processing}
            className="btn-secondary btn-sm"
          >
            {busyAction === "process" || processing ? "Processing..." : "Re-analyze page"}
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* 1. AI Summary */}
          <section className="rounded-xl border border-[#8e4ec6]/25 bg-[#8e4ec6]/[0.03] dark:bg-[#8e4ec6]/[0.07] p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#8e4ec6] dark:text-[#bf7af0]">
                AI Summary
              </h4>
              <button
                type="button"
                onClick={handleRegenerateSummary}
                disabled={Boolean(busyAction) || processing}
                className="text-xs font-medium text-[#8e4ec6] dark:text-[#bf7af0] hover:underline disabled:opacity-40"
              >
                {busyAction === "summary" ? "Regenerating..." : "Regenerate"}
              </button>
            </div>
            {summary ? (
              <p className="text-sm leading-relaxed text-[#222] dark:text-[#e5e5e5]">
                {summary.text}
              </p>
            ) : (
              <p className="text-xs text-[#666] dark:text-[#a1a1a1]">
                {processing
                  ? "Generating AI summary..."
                  : "No AI summary generated yet. Click Regenerate or Re-analyze page."}
              </p>
            )}
          </section>

          {/* 2. Suggested Tags */}
          <section className="rounded-xl border border-[#ebebeb] dark:border-[#242424] p-4">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#666] dark:text-[#a1a1a1]">
                Suggested Tags
              </h4>
              <div className="flex items-center gap-3">
                {pendingTags.length > 1 && onRespondTag && (
                  <button
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={() =>
                      runAction("accept_all_tags", () =>
                        onRespondTag(bookmark._id, { action: "accept_all" })
                      )
                    }
                    className="text-xs font-medium text-[#30a46c] hover:underline disabled:opacity-40"
                  >
                    Accept all
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRegenerateTags}
                  disabled={Boolean(busyAction) || processing}
                  className="text-xs font-medium text-[#0070f3] dark:text-[#52a8ff] hover:underline disabled:opacity-40"
                >
                  {busyAction === "tags" ? "Suggesting..." : "Refresh"}
                </button>
              </div>
            </div>

            {bookmark.tags?.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] text-[#666] dark:text-[#a1a1a1] mb-1.5">
                  Confirmed tags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {bookmark.tags.map((t, idx) => (
                    <span key={idx} className="chip" style={badgeStyle(t)}>
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {pendingTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {pendingTags.map((item) => {
                  const key = item.normalized || item.name;
                  const isEditing = editingTagKey === key;
                  return isEditing ? (
                    <div key={key} className="inline-flex items-center gap-1">
                      <input
                        type="text"
                        value={editedTagValue}
                        onChange={(e) => setEditedTagValue(e.target.value)}
                        className="field h-7 w-32 text-xs px-2"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() =>
                          runAction(`accept:${key}`, async () => {
                            await onRespondTag(bookmark._id, {
                              action: "accept",
                              tag: item.name,
                              editedTag: editedTagValue,
                            });
                            setEditingTagKey("");
                          })
                        }
                        className="btn-primary h-7 px-2 text-xs"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTagKey("")}
                        className="btn-secondary h-7 px-2 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#8e4ec6]/45 bg-[#8e4ec6]/[0.06] px-2.5 py-1 text-xs font-medium text-[#6e2eb8] dark:text-[#d8a6ff]"
                    >
                      <span>{item.name}</span>
                      {item.isExistingUserTag && (
                        <span className="text-[10px] opacity-70">(existing)</span>
                      )}
                      {onRespondTag && (
                        <>
                          <button
                            type="button"
                            disabled={Boolean(busyAction)}
                            onClick={() =>
                              runAction(`accept:${key}`, () =>
                                onRespondTag(bookmark._id, { action: "accept", tag: item.name })
                              )
                            }
                            className="hover:text-[#30a46c] font-bold"
                            title="Accept"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(busyAction)}
                            onClick={() => {
                              setEditingTagKey(key);
                              setEditedTagValue(item.name);
                            }}
                            className="hover:text-[#0070f3] text-[11px]"
                            title="Edit before accepting"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(busyAction)}
                            onClick={() =>
                              runAction(`reject:${key}`, () =>
                                onRespondTag(bookmark._id, { action: "reject", tag: item.name })
                              )
                            }
                            className="hover:text-[#e5484d] font-bold"
                            title="Reject"
                          >
                            &times;
                          </button>
                        </>
                      )}
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[#666] dark:text-[#a1a1a1]">
                {processing ? "Generating tag suggestions..." : "No pending tag suggestions."}
              </p>
            )}
          </section>

          {/* 3. Recommended Folder */}
          <section className="rounded-xl border border-[#ebebeb] dark:border-[#242424] p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#666] dark:text-[#a1a1a1]">
                Recommended Folder
              </h4>
              <button
                type="button"
                onClick={handleRegenerateFolder}
                disabled={Boolean(busyAction) || processing}
                className="text-xs font-medium text-[#0070f3] dark:text-[#52a8ff] hover:underline disabled:opacity-40"
              >
                {busyAction === "folder" ? "Checking..." : "Refresh"}
              </button>
            </div>

            {suggestedFolder?.name && suggestedFolder.status !== "none" ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{suggestedFolder.name}</span>
                    {suggestedFolder.isNewFolder && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#0070f3]/10 text-[#0070f3]">
                        New folder
                      </span>
                    )}
                    {suggestedFolder.status === "accepted" && (
                      <span className="text-[11px] text-[#30a46c] font-medium">Accepted</span>
                    )}
                    {suggestedFolder.status === "rejected" && (
                      <span className="text-[11px] text-[#666] dark:text-[#a1a1a1]">Dismissed</span>
                    )}
                  </div>
                  {suggestedFolder.reason && (
                    <p className="text-xs text-[#666] dark:text-[#a1a1a1] mt-1">
                      {suggestedFolder.reason}
                    </p>
                  )}
                </div>

                {suggestedFolder.status === "pending" && onRespondFolder && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() =>
                        runAction("accept_folder", () =>
                          onRespondFolder(bookmark._id, { action: "accept" })
                        )
                      }
                      className="btn-primary btn-sm"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() =>
                        runAction("reject_folder", () =>
                          onRespondFolder(bookmark._id, { action: "reject" })
                        )
                      }
                      className="btn-secondary btn-sm"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#666] dark:text-[#a1a1a1]">
                {processing
                  ? "Evaluating best folder..."
                  : "No folder recommendation available yet."}
              </p>
            )}
          </section>

          {/* 4. Extracted Webpage Metadata */}
          <section className="rounded-xl border border-[#ebebeb] dark:border-[#242424] p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[#666] dark:text-[#a1a1a1] mb-3">
              Webpage Metadata
            </h4>
            {meta.title || meta.description || meta.domain ? (
              <div className="flex flex-col gap-3 text-xs">
                {meta.ogImage && (
                  <img
                    src={meta.ogImage}
                    alt={meta.ogTitle || meta.title || "Webpage preview"}
                    className="w-full max-h-44 object-cover rounded-lg border border-[#ebebeb] dark:border-[#242424]"
                    onError={(e) => (e.target.style.display = "none")}
                  />
                )}
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                  {meta.domain && (
                    <div>
                      <dt className="text-[#666] dark:text-[#a1a1a1]">Domain</dt>
                      <dd className="font-medium mt-0.5">{meta.domain}</dd>
                    </div>
                  )}
                  {meta.author && (
                    <div>
                      <dt className="text-[#666] dark:text-[#a1a1a1]">Author</dt>
                      <dd className="font-medium mt-0.5">{meta.author}</dd>
                    </div>
                  )}
                  {meta.publishedAt && (
                    <div>
                      <dt className="text-[#666] dark:text-[#a1a1a1]">Published</dt>
                      <dd className="font-medium mt-0.5">{formatDateTime(meta.publishedAt)}</dd>
                    </div>
                  )}
                  {meta.canonicalUrl && (
                    <div className="sm:col-span-2">
                      <dt className="text-[#666] dark:text-[#a1a1a1]">Canonical URL</dt>
                      <dd className="font-medium mt-0.5 break-all">{meta.canonicalUrl}</dd>
                    </div>
                  )}
                  {meta.description && (
                    <div className="sm:col-span-2">
                      <dt className="text-[#666] dark:text-[#a1a1a1]">Extracted description</dt>
                      <dd className="mt-0.5 text-[#333] dark:text-[#d4d4d4] leading-relaxed">
                        {meta.description}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            ) : (
              <p className="text-xs text-[#666] dark:text-[#a1a1a1]">
                {processing
                  ? "Extracting webpage metadata..."
                  : "No webpage metadata extracted yet."}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
