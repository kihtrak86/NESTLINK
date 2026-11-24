export default function Pagination({ page, pages, total, onPageChange }) {
  if (pages <= 1) return null;

  const goTo = (p) => {
    if (p < 1 || p > pages || p === page) return;
    onPageChange(p);
  };

  // Compact page list: first, last, current +/-1, with ellipses
  const pageNumbers = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) {
      pageNumbers.push(p);
    } else if (pageNumbers[pageNumbers.length - 1] !== "...") {
      pageNumbers.push("...");
    }
  }

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-12 pt-6 border-t border-black/10 dark:border-white/10"
    >
      <p className="text-xs sm:text-sm text-black/60 dark:text-white/60">
        Page {page} of {pages} &middot; {total} total
      </p>

      <div className="flex items-center gap-1.5">
        <button onClick={() => goTo(page - 1)} disabled={page === 1} className="btn-secondary btn-sm">
          Prev
        </button>

        {pageNumbers.map((p, idx) =>
          p === "..." ? (
            <span key={`ellipsis-${idx}`} className="px-2 text-black/60 dark:text-white/60">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => goTo(p)}
              aria-current={p === page ? "page" : undefined}
              className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${
                p === page
                  ? "bg-[#171717] text-white dark:bg-[#ededed] dark:text-black"
                  : "text-black/60 dark:text-white/60 hover:bg-carbon-100 dark:hover:bg-carbon-800 hover:text-black dark:hover:text-white"
              }`}
            >
              {p}
            </button>
          )
        )}

        <button onClick={() => goTo(page + 1)} disabled={page === pages} className="btn-secondary btn-sm">
          Next
        </button>
      </div>
    </nav>
  );
}
