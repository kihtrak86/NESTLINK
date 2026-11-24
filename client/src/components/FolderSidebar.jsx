const FolderIcon = ({ open }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    {open ? (
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
    ) : (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    )}
  </svg>
);

function itemClasses(active) {
  return `w-full flex items-center gap-2.5 px-3 h-10 rounded-lg text-sm text-left transition-colors duration-150 border-l-2 ${
    active
      ? "border-gold-400 bg-carbon-100 dark:bg-carbon-850 font-semibold text-carbon-950 dark:text-gold-300"
      : "border-transparent font-medium text-gold-700 dark:text-gold-300 hover:bg-carbon-100 dark:hover:bg-carbon-850 hover:text-carbon-950 dark:hover:text-white"
  }`;
}

export default function FolderSidebar({ value, onChange, folders = [], onManage }) {
  return (
    <aside aria-label="Folders" className="lg:w-64 lg:flex-shrink-0">
      {/* Desktop: structured sidebar panel */}
      <div className="hidden lg:block surface p-3 sticky top-24">
        <div className="flex items-center justify-between px-3 pt-1 pb-3 mb-2 border-b border-carbon-200 dark:border-carbon-800">
          <h2 className="eyebrow">Folders</h2>
          <button
            onClick={onManage}
            title="Manage folders"
            aria-label="Manage folders"
            className="text-xs font-semibold text-gold-700 dark:text-gold-300 hover:text-carbon-950 dark:hover:text-white transition-colors"
          >
            Manage
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto">
          <button onClick={() => onChange("All")} className={itemClasses(value === "All")} aria-current={value === "All"}>
            <FolderIcon open={value === "All"} />
            <span className="truncate">All bookmarks</span>
          </button>

          {folders.length > 0 && (
            <div className="my-2 mx-3 border-t border-carbon-200 dark:border-carbon-800" />
          )}

          {folders.map((name) => (
            <button
              key={name}
              onClick={() => onChange(name)}
              className={itemClasses(value === name)}
              aria-current={value === name}
              title={name}
            >
              <FolderIcon open={value === name} />
              <span className="truncate">{name}</span>
            </button>
          ))}

          {folders.length === 0 && (
            <p className="px-3 py-2 text-xs text-gold-700 dark:text-gold-300">
              No folders yet. Add a bookmark to create one.
            </p>
          )}
        </nav>
      </div>

      {/* Mobile / tablet: horizontal scrollable folder tabs */}
      <div className="lg:hidden flex items-center gap-2">
        <div className="flex-1 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {["All", ...folders].map((name) => {
            const active = value === name;
            return (
              <button
                key={name}
                onClick={() => onChange(name)}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-sm font-medium transition-colors ${
                  active
                    ? "border-gold-400 bg-carbon-100 dark:bg-carbon-850 text-carbon-950 dark:text-gold-300"
                    : "border-carbon-200 dark:border-carbon-700 text-gold-700 dark:text-gold-300"
                }`}
              >
                {name === "All" ? "All bookmarks" : name}
              </button>
            );
          })}
        </div>
        <button
          onClick={onManage}
          aria-label="Manage folders"
          className="btn-secondary w-9 h-9 flex-shrink-0"
        >
          <FolderIcon />
        </button>
      </div>
    </aside>
  );
}
