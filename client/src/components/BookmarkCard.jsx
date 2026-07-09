const FOLDER_COLORS = {
  Work: "bg-blue-100 text-blue-700",
  Study: "bg-purple-100 text-purple-700",
  Personal: "bg-emerald-100 text-emerald-700",
};

function getFolderColor(folder) {
  return FOLDER_COLORS[folder] || "bg-slate-100 text-slate-700";
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function BookmarkCard({ bookmark, onEdit, onDelete }) {
  const { title, url, folder, tags, createdAt } = bookmark;

  return (
    <div className="group bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card hover:shadow-cardHover hover:-translate-y-0.5 transition-all p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <img
            src={`https://www.google.com/s2/favicons?domain=${getHostname(url)}&sz=64`}
            alt=""
            className="w-8 h-8 rounded-md mt-0.5 flex-shrink-0"
            onError={(e) => (e.target.style.visibility = "hidden")}
          />
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</h3>
            <p className="text-sm text-slate-400 dark:text-slate-500 truncate">{getHostname(url)}</p>
          </div>
        </div>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${getFolderColor(
            folder
          )}`}
        >
          {folder}
        </span>
      </div>

      {tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, idx) => (
            <span
              key={idx}
              className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500 mt-auto">Added {formatDate(createdAt)}</p>

      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-center text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white py-1.5 rounded-lg transition-colors"
        >
          Open
        </a>
        <button
          onClick={() => onEdit(bookmark)}
          className="flex-1 text-sm font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 py-1.5 rounded-lg transition-colors"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(bookmark._id)}
          className="flex-1 text-sm font-medium bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 py-1.5 rounded-lg transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
