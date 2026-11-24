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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="surface bg-white dark:bg-[#0a0a0a] w-full max-w-md p-7 shadow-pop dark:shadow-none animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Manage folders"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold tracking-tight">Manage folders</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-carbon-100 dark:hover:bg-carbon-800 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {error && <p className="notice mb-4">{error}</p>}

        {folders.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60 text-center py-10">
            No folders yet. Create one when adding a bookmark.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {folders.map((folder) => (
              <li
                key={folder._id}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-md border border-[#ebebeb] dark:border-[#242424]"
              >
                <span className="text-sm font-medium truncate">{folder.name}</span>
                <button
                  onClick={() => handleDelete(folder)}
                  disabled={deletingId === folder._id}
                  className="btn-danger btn-sm"
                >
                  {deletingId === folder._id ? "Deleting..." : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button onClick={onClose} className="btn-secondary h-11 w-full mt-5">
          Close
        </button>
      </div>
    </div>
  );
}
