export default function TagFilter({ value, onChange, tags = [] }) {
  if (tags.length === 0) return null;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-card focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
    >
      <option value="All">All Tags</option>
      {tags.map((tag) => (
        <option key={tag} value={tag}>
          #{tag}
        </option>
      ))}
    </select>
  );
}
