export default function EmptyState({ hasFilters, searchMode = "keyword", onAddClick }) {
  const isSemantic = searchMode === "semantic" && hasFilters;

  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-4 animate-fade-in">
      <div className="w-12 h-12 rounded-xl border border-[#0070f3]/30 bg-[#0070f3]/10 text-[#0070f3] flex items-center justify-center mb-5">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold tracking-tight">
        {isSemantic ? "No semantically similar bookmarks" : hasFilters ? "No bookmarks found" : "Your shelf is empty"}
      </h3>
      <p className="text-black/60 dark:text-white/60 text-sm mt-1.5 max-w-sm">
        {isSemantic
          ? "Try rephrasing your query, clearing folder and tag filters, or switching to keyword search."
          : hasFilters
          ? "Try adjusting your search or filters."
          : "Start saving links you want to keep before closing that tab."}
      </p>
      {!hasFilters && onAddClick && (
        <button onClick={onAddClick} className="btn-primary btn-md mt-6">
          Add your first bookmark
        </button>
      )}
    </div>
  );
}
