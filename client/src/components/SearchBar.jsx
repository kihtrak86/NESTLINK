const sparkle =
  "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z";

export default function SearchBar({
  value,
  onChange,
  mode = "keyword",
  onModeChange,
  onSubmit,
  loading = false,
}) {
  const isSemantic = mode === "semantic";

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2 flex-1">
      <div className="relative flex-1">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
            isSemantic ? "text-[#8e4ec6]" : "text-[#8f8f8f]"
          } ${loading ? "animate-pulse" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d={isSemantic ? sparkle : "M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"}
          />
        </svg>

        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={isSemantic ? "AI semantic search bookmarks" : "Keyword search bookmarks"}
          placeholder={
            isSemantic
              ? "Describe what you're looking for..."
              : "Search by title, description, folder, or tag..."
          }
          className={`field !pl-10 ${value ? "!pr-9" : ""} `}
        />

        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white px-1 text-lg leading-none"
          >
            &times;
          </button>
        )}
      </div>

      {onModeChange && (
        <div
          role="group"
          aria-label="Search mode"
          className="inline-flex h-10 items-center rounded-md border border-[#e5e5e5] dark:border-[#2e2e2e] bg-white dark:bg-black p-0.5 flex-shrink-0 self-start sm:self-auto"
        >
          {[
            { id: "keyword", label: "Keyword", icon: null },
            { id: "semantic", label: "AI search", icon: sparkle },
          ].map((opt) => {
            const active = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onModeChange(opt.id)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 h-full px-3 rounded text-[13px] font-medium whitespace-nowrap transition-all duration-200 ${
                  active
                    ? "bg-[#171717] text-white dark:bg-[#ededed] dark:text-black"
                    : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                }`}
              >
                {opt.icon && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon} />
                  </svg>
                )}
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
