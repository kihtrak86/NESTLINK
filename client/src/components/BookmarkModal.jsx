import { useState, useEffect } from "react";

const emptyForm = { title: "", url: "", folder: "", tags: "" };
const NEW_FOLDER_VALUE = "__new__";

function isValidUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export default function BookmarkModal({ isOpen, onClose, onSave, initialData, folders = [] }) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [isNewFolder, setIsNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const isEditMode = Boolean(initialData);
  const defaultFolder = folders[0] || "Personal";

  useEffect(() => {
    if (initialData) {
      const folderExists = folders.includes(initialData.folder);
      setForm({
        title: initialData.title || "",
        url: initialData.url || "",
        folder: folderExists ? initialData.folder : NEW_FOLDER_VALUE,
        tags: (initialData.tags || []).join(", "),
      });
      setIsNewFolder(!folderExists);
      setNewFolderName(!folderExists ? initialData.folder : "");
    } else {
      setForm({ ...emptyForm, folder: defaultFolder });
      setIsNewFolder(folders.length === 0);
      setNewFolderName("");
    }
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleFolderSelect = (e) => {
    const val = e.target.value;
    if (val === NEW_FOLDER_VALUE) {
      setIsNewFolder(true);
      setForm((prev) => ({ ...prev, folder: NEW_FOLDER_VALUE }));
    } else {
      setIsNewFolder(false);
      setForm((prev) => ({ ...prev, folder: val }));
    }
  };

  const validate = () => {
    const newErrors = {};
    const effectiveFolder = isNewFolder ? newFolderName.trim() : form.folder.trim();

    if (!form.title.trim()) newErrors.title = "Title is required";
    if (!form.url.trim()) {
      newErrors.url = "URL is required";
    } else if (!isValidUrl(form.url.trim())) {
      newErrors.url = "Please enter a valid URL (e.g. https://example.com)";
    }
    if (!effectiveFolder) newErrors.folder = "Folder name is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const effectiveFolder = isNewFolder ? newFolderName.trim() : form.folder.trim();

    const payload = {
      title: form.title.trim(),
      url: form.url.trim(),
      folder: effectiveFolder,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };

    try {
      setSubmitting(true);
      await onSave(payload, initialData?._id);
      onClose();
    } catch (err) {
      const message =
        err?.response?.data?.message || "Something went wrong. Please try again.";
      setErrors({ form: message });
    } finally {
      setSubmitting(false);
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
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {isEditMode ? "Edit Bookmark" : "Add Bookmark"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {errors.form && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 px-3 py-2 rounded-lg">
              {errors.form}
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={handleChange("title")}
              placeholder="e.g. React Documentation"
              className={`w-full px-3 py-2 rounded-lg border dark:bg-slate-700 dark:text-slate-100 ${
                errors.title ? "border-red-400" : "border-slate-200 dark:border-slate-600"
              } focus:outline-none focus:ring-2 focus:ring-brand-500`}
            />
            {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">URL</label>
            <input
              type="text"
              value={form.url}
              onChange={handleChange("url")}
              placeholder="https://example.com"
              className={`w-full px-3 py-2 rounded-lg border dark:bg-slate-700 dark:text-slate-100 ${
                errors.url ? "border-red-400" : "border-slate-200 dark:border-slate-600"
              } focus:outline-none focus:ring-2 focus:ring-brand-500`}
            />
            {errors.url && <p className="text-xs text-red-600 mt-1">{errors.url}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Folder</label>
            {!isNewFolder ? (
              <select
                value={form.folder}
                onChange={handleFolderSelect}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
              >
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
                <option value={NEW_FOLDER_VALUE}>+ Create new folder...</option>
              </select>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Recipes, Travel, Side Project"
                  className={`flex-1 px-3 py-2 rounded-lg border dark:bg-slate-700 dark:text-slate-100 ${
                    errors.folder ? "border-red-400" : "border-slate-200 dark:border-slate-600"
                  } focus:outline-none focus:ring-2 focus:ring-brand-500`}
                />
                {folders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewFolder(false);
                      setForm((prev) => ({ ...prev, folder: folders[0] }));
                    }}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
            {errors.folder && <p className="text-xs text-red-600 mt-1">{errors.folder}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Tags <span className="text-slate-400 font-normal">(comma separated)</span>
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={handleChange("tags")}
              placeholder="react, docs, frontend"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium disabled:opacity-60"
            >
              {submitting ? "Saving..." : isEditMode ? "Save Changes" : "Add Bookmark"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
