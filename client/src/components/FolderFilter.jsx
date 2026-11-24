const BASE_FOLDERS = ["All"];

export default function FolderFilter({ value, onChange, folders = [] }) {
  const options = [...BASE_FOLDERS, ...folders];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filter by folder"
      className="field !w-auto cursor-pointer"
    >
      {options.map((folder) => (
        <option key={folder} value={folder}>
          {folder === "All" ? "All folders" : folder}
        </option>
      ))}
    </select>
  );
}
