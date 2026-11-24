import { colorFor } from "../utils/colors";

const Icon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
  </svg>
);

function Card({ label, count, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`surface text-left p-3.5 flex items-center gap-3 ${
        active
          ? "!border-[#171717] dark:!border-[#ededed]"
          : "hover:border-[#c9c9c9] dark:hover:border-[#454545]"
      }`}
    >
      <span
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border"
        style={{ color, backgroundColor: `${color}1a`, borderColor: `${color}40` }}
      >
        <Icon />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold truncate">{label}</span>
        <span className="block text-xs text-black/50 dark:text-white/50">
          {count ?? "–"} {count === 1 ? "link" : "links"}
        </span>
      </span>
    </button>
  );
}

export default function FolderGrid({ value, onChange, folders = [], counts = {}, total, onManage }) {
  return (
    <section aria-label="Folders" className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="eyebrow">Folders</h2>
        <button onClick={onManage} className="text-[13px] font-medium text-[#666] dark:text-[#a1a1a1] hover:text-black dark:hover:text-white transition-colors">
          Manage folders
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Card label="All bookmarks" color="#0070f3" count={total} active={value === "All"} onClick={() => onChange("All")} />
        {folders.map((f) => (
          <Card key={f} label={f} color={colorFor(f)} count={counts[f]} active={value === f} onClick={() => onChange(f)} />
        ))}
      </div>
    </section>
  );
}
