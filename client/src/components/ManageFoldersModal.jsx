import { useState } from "react";

export default function ManageFoldersModal({ isOpen, onClose, folders, onDelete }) {
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleDelete = async (folder) => {
    const confirmed = window.confirm(
      `Delete "${folder.name}"? Bookmarks inside will move to "Uncategorized", not be deleted.`
    );
    if (!confirmed) return;

    try {
      setError("");
      setDeletingId(folder._id);
      await onDelete(folder._id);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete folder. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Manage Folders</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 px-3 py-2 rounded-lg mb-4">
            {error}
          </p>
        )}

        {folders.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">
            No folders yet. Create one when adding a bookmark.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {folders.map((folder) => (
              <li
                key={folder._id}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600"
              >
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                  {folder.name}
                </span>
                <button
                  onClick={() => handleDelete(folder)}
                  disabled={deletingId === folder._id}
                  className="text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 px-2.5 py-1 rounded-md disabled:opacity-50"
                >
                  {deletingId === folder._id ? "Deleting..." : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={onClose}
          className="w-full mt-5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium"
        >
          Close
        </button>
      </div>
    </div>
  );
}
