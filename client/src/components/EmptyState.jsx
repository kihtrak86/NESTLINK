export default function EmptyState({ hasFilters }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-4">
      <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-8 h-8 text-brand-400 dark:text-brand-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
        {hasFilters ? "No bookmarks found" : "Your shelf is empty"}
      </h3>
      <p className="text-slate-400 dark:text-slate-500 text-sm mt-1 max-w-xs">
        {hasFilters
          ? "Try adjusting your search or folder filter."
          : "Start saving links you want to keep before closing that tab."}
      </p>
    </div>
  );
}
