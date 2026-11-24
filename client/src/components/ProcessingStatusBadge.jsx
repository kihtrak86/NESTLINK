import { getProcessingStatusMeta } from "../utils/aiInsightsHelpers";

const TONE_CLASSES = {
  info: "bg-[#0070f3]/10 text-[#0070f3] border-[#0070f3]/25",
  ai: "bg-[#8e4ec6]/10 text-[#8e4ec6] border-[#8e4ec6]/30",
  success: "bg-[#30a46c]/10 text-[#299764] dark:text-[#3dd68c] border-[#30a46c]/25",
  warning: "bg-[#f76b15]/10 text-[#cc4e00] dark:text-[#ff8b3e] border-[#f76b15]/30",
  error: "bg-[#e5484d]/10 text-[#c62a2f] dark:text-[#ff6369] border-[#e5484d]/30",
  neutral: "bg-[#fafafa] dark:bg-[#111] text-[#666] dark:text-[#a1a1a1] border-[#e5e5e5] dark:border-[#2e2e2e]",
};

export default function ProcessingStatusBadge({ status, showIdle = false, showCompleted = false }) {
  if (!status || (status === "idle" && !showIdle) || (status === "completed" && !showCompleted)) {
    return null;
  }

  const meta = getProcessingStatusMeta(status);
  const toneClass = TONE_CLASSES[meta.tone] || TONE_CLASSES.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${toneClass}`}
    >
      {meta.active && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" aria-hidden="true" />
      )}
      {meta.label}
    </span>
  );
}
