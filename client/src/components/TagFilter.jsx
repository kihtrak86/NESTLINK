export default function TagFilter({ value, onChange, tags = [] }) {
  if (tags.length === 0) return null;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filter by tag"
      className="field !w-auto cursor-pointer"
    >
      <option value="All">All tags</option>
      {tags.map((tag) => (
        <option key={tag} value={tag}>
          #{tag}
        </option>
      ))}
    </select>
  );
}
