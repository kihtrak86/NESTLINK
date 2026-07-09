const BASE_FOLDERS = ["All"];

export default function FolderFilter({ value, onChange, folders = [] }) {
  const options = [...BASE_FOLDERS, ...folders];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-card focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
    >
      {options.map((folder) => (
        <option key={folder} value={folder}>
          {folder === "All" ? "All Folders" : folder}
        </option>
      ))}
    </select>
  );
}
