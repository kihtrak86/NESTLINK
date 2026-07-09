export default function Pagination({ page, pages, total, onPageChange }) {
  if (pages <= 1) return null;

  const goTo = (p) => {
    if (p < 1 || p > pages || p === page) return;
    onPageChange(p);
  };

  // Build a compact page list: first, last, current +/-1, with ellipses
  const pageNumbers = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) {
      pageNumbers.push(p);
    } else if (pageNumbers[pageNumbers.length - 1] !== "...") {
      pageNumbers.push("...");
    }
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-8">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Page {page} of {pages} &middot; {total} total
      </p>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => goTo(page - 1)}
          disabled={page === 1}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Prev
        </button>

        {pageNumbers.map((p, idx) =>
          p === "..." ? (
            <span key={`ellipsis-${idx}`} className="px-2 text-slate-400 dark:text-slate-500">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => goTo(p)}
              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                p === page
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => goTo(page + 1)}
          disabled={page === pages}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
