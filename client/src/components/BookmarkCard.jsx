import { useState } from "react";
import { badgeStyle, colorFor } from "../utils/colors";
import ProcessingStatusBadge from "./ProcessingStatusBadge";
import {
  getDisplaySummary,
  getPendingSuggestedTags,
  getPendingFolderRecommendation,
} from "../utils/aiInsightsHelpers";

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function BookmarkCard({
  bookmark,
  onEdit,
  onDelete,
  onViewDetails,
  onRespondTag,
  onRespondFolder,
  index = 0,
}) {
  const { title, description, url, folder, tags, createdAt, score, processingStatus, extractedMetadata } =
    bookmark;

  const [busyKey, setBusyKey] = useState("");
  const hasScore = typeof score === "number" && Number.isFinite(score);
  const matchPercent = hasScore ? Math.max(0, Math.min(100, Math.round(score * 100))) : null;

  const summary = getDisplaySummary(bookmark);
  const pendingTags = getPendingSuggestedTags(bookmark);
  const pendingFolder = getPendingFolderRecommendation(bookmark);
  const faviconSrc =
    extractedMetadata?.favicon ||
    `https://www.google.com/s2/favicons?domain=${getHostname(url)}&sz=64`;

  const handleTagAction = async (tagName, action) => {
    if (!onRespondTag || busyKey) return;
    setBusyKey(`tag:${tagName}`);
    try {
      await onRespondTag(bookmark._id, { action, tag: tagName });
    } finally {
      setBusyKey("");
    }
  };

  const handleFolderAction = async (action) => {
    if (!onRespondFolder || busyKey) return;
    setBusyKey(`folder:${action}`);
    try {
      await onRespondFolder(bookmark._id, { action });
    } finally {
      setBusyKey("");
    }
  };

  return (
    <article
      className="group surface p-5 flex flex-col gap-3 hover:border-[#c9c9c9] dark:hover:border-[#454545] animate-fade-up"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <img
            src={faviconSrc}
            alt=""
            className="w-9 h-9 p-1.5 rounded-lg mt-0.5 flex-shrink-0 bg-white border border-black/10 dark:border-white/10 object-contain"
            onError={(e) => {
              const fallback = `https://www.google.com/s2/favicons?domain=${getHostname(url)}&sz=64`;
              if (e.target.src !== fallback) {
                e.target.src = fallback;
              } else {
                e.target.style.visibility = "hidden";
              }
            }}
          />
          <div className="min-w-0">
            <h3 className="font-semibold tracking-tight truncate text-[15px]">{title}</h3>
            <p className="text-xs text-black/50 dark:text-white/50 truncate mt-0.5">
              {extractedMetadata?.domain || getHostname(url)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className="chip whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colorFor(folder) }} />
            {folder}
          </span>
          {matchPercent !== null && (
            <span
              title={`Cosine similarity score: ${score.toFixed(4)}`}
              className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#0070f3]/10 text-[#0070f3] border border-[#0070f3]/25 whitespace-nowrap"
            >
              {matchPercent}% match
            </span>
          )}
          <ProcessingStatusBadge status={processingStatus} />
        </div>
      </div>

      {description && (
        <p className="text-sm text-black/60 dark:text-white/60 line-clamp-2 leading-relaxed">
          {description}
        </p>
      )}

      {summary && (
        <div className="rounded-lg border border-[#8e4ec6]/20 bg-[#8e4ec6]/[0.04] dark:bg-[#8e4ec6]/[0.08] px-3 py-2">
          <p className="text-[11px] font-medium text-[#8e4ec6] dark:text-[#bf7af0] mb-0.5">
            AI Summary
          </p>
          <p className="text-xs text-[#333] dark:text-[#d4d4d4] line-clamp-3 leading-relaxed">
            {summary.text}
          </p>
        </div>
      )}

      {/* User-confirmed tags */}
      {tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, idx) => (
            <span key={idx} className="chip" style={badgeStyle(tag)}>
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Visually distinct AI-suggested tags */}
      {pendingTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[#8e4ec6] dark:text-[#bf7af0] font-medium mr-0.5">
            Suggested:
          </span>
          {pendingTags.slice(0, 4).map((item) => (
            <span
              key={item.normalized || item.name}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#8e4ec6]/45 bg-[#8e4ec6]/[0.06] px-2 py-0.5 text-[11px] font-medium text-[#6e2eb8] dark:text-[#d8a6ff]"
            >
              <span>{item.name}</span>
              {onRespondTag && (
                <>
                  <button
                    type="button"
                    disabled={Boolean(busyKey)}
                    onClick={() => handleTagAction(item.name, "accept")}
                    title={`Accept tag "${item.name}"`}
                    className="hover:text-[#30a46c] font-bold leading-none px-0.5 disabled:opacity-40"
                    aria-label={`Accept suggested tag ${item.name}`}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busyKey)}
                    onClick={() => handleTagAction(item.name, "reject")}
                    title={`Dismiss tag "${item.name}"`}
                    className="hover:text-[#e5484d] font-bold leading-none px-0.5 disabled:opacity-40"
                    aria-label={`Reject suggested tag ${item.name}`}
                  >
                    &times;
                  </button>
                </>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Visually distinct AI folder recommendation */}
      {pendingFolder && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-[#0070f3]/35 bg-[#0070f3]/[0.04] dark:bg-[#0070f3]/[0.08] px-2.5 py-1.5 text-xs">
          <div className="min-w-0 truncate">
            <span className="text-[#666] dark:text-[#a1a1a1]">Move to </span>
            <span className="font-medium text-[#0070f3] dark:text-[#52a8ff]">
              {pendingFolder.name}
            </span>
            {pendingFolder.isNewFolder && (
              <span className="ml-1 text-[10px] uppercase tracking-wide text-[#666] dark:text-[#a1a1a1]">
                (new)
              </span>
            )}
          </div>
          {onRespondFolder && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                disabled={Boolean(busyKey)}
                onClick={() => handleFolderAction("accept")}
                className="px-2 py-0.5 rounded bg-[#0070f3] text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-40"
              >
                Accept
              </button>
              <button
                type="button"
                disabled={Boolean(busyKey)}
                onClick={() => handleFolderAction("reject")}
                className="px-1.5 py-0.5 rounded text-[#666] dark:text-[#a1a1a1] hover:text-[#e5484d] text-[11px] disabled:opacity-40"
                aria-label="Reject suggested folder"
              >
                &times;
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-black/40 dark:text-white/40 mt-auto">
        <span>Added {formatDate(createdAt)}</span>
        {onViewDetails && (
          <button
            type="button"
            onClick={() => onViewDetails(bookmark)}
            className="text-[#8e4ec6] dark:text-[#bf7af0] hover:underline font-medium"
          >
            AI Insights
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 pt-4 border-t border-black/10 dark:border-white/10">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary btn-sm flex-1 h-9"
        >
          Open
        </a>
        <button onClick={() => onEdit(bookmark)} className="btn-secondary btn-sm flex-1 h-9">
          Edit
        </button>
        <button onClick={() => onDelete(bookmark._id)} className="btn-danger btn-sm flex-1 h-9">
          Delete
        </button>
      </div>
    </article>
  );
}
