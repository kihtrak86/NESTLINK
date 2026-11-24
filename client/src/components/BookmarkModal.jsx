import { useState, useEffect } from "react";
import { extractUrlPreview } from "../services/api";

const emptyForm = { title: "", description: "", url: "", folder: "", tags: "" };
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

  // Phase 2 URL metadata preview state
  const [extracting, setExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState("");
  const [extractError, setExtractError] = useState("");
  const [previewMeta, setPreviewMeta] = useState(null);

  const isEditMode = Boolean(initialData);
  const defaultFolder = folders[0] || "Personal";

  useEffect(() => {
    if (initialData) {
      const folderExists = folders.includes(initialData.folder);
      setForm({
        title: initialData.title || "",
        description: initialData.description || "",
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
    setExtracting(false);
    setExtractStatus("");
    setExtractError("");
    setPreviewMeta(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleFetchMetadata = async () => {
    const targetUrl = form.url.trim();
    if (!isValidUrl(targetUrl)) {
      setExtractError("Enter a valid http:// or https:// URL first.");
      return;
    }

    setExtracting(true);
    setExtractError("");
    setExtractStatus("Reading webpage metadata...");
    try {
      const data = await extractUrlPreview(targetUrl);
      const meta = data?.metadata || {};
      setPreviewMeta(meta);

      setForm((prev) => ({
        ...prev,
        title: prev.title.trim() ? prev.title : meta.title || meta.ogTitle || prev.title,
        description: prev.description.trim()
          ? prev.description
          : meta.description || meta.ogDescription || prev.description,
      }));

      setExtractStatus(
        meta.title || meta.description
          ? "Webpage metadata extracted. You can edit any field before saving."
          : "Page reached, but limited metadata was found. You can still save normally."
      );
    } catch (err) {
      setPreviewMeta(null);
      setExtractStatus("");
      setExtractError(
        err?.response?.data?.message ||
          "Could not extract webpage metadata. You can still save the bookmark normally."
      );
    } finally {
      setExtracting(false);
    }
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
      description: form.description.trim(),
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

  const fieldClass = (hasError) => `field ${hasError ? "field-error" : ""}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="surface bg-white dark:bg-[#0a0a0a] w-full max-w-md p-7 shadow-pop dark:shadow-none animate-scale-in max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isEditMode ? "Edit bookmark" : "Add bookmark"}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold tracking-tight">
            {isEditMode ? "Edit bookmark" : "Add bookmark"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-carbon-100 dark:hover:bg-carbon-800 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {errors.form && <p className="notice">{errors.form}</p>}

          <div>
            <label className="field-label">URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.url}
                onChange={handleChange("url")}
                placeholder="https://example.com"
                className={`flex-1 ${fieldClass(errors.url)}`}
              />
              <button
                type="button"
                onClick={handleFetchMetadata}
                disabled={extracting || !form.url.trim()}
                className="btn-secondary h-10 px-3 whitespace-nowrap text-xs"
                title="Extract title and description from webpage"
              >
                {extracting ? "Fetching..." : "Fetch info"}
              </button>
            </div>
            {errors.url && (
              <p className="text-xs text-black/60 dark:text-white/60 mt-1.5">{errors.url}</p>
            )}
            {extractStatus && (
              <p className="text-xs text-[#0070f3] dark:text-[#52a8ff] mt-1.5">{extractStatus}</p>
            )}
            {extractError && (
              <p className="text-xs text-[#c62a2f] dark:text-[#ff6369] mt-1.5">{extractError}</p>
            )}
            {previewMeta && (previewMeta.title || previewMeta.description) && (
              <div className="mt-2 rounded-lg border border-[#ebebeb] dark:border-[#242424] bg-[#fafafa] dark:bg-[#111] p-2.5 text-xs">
                <p className="font-medium truncate">{previewMeta.title || previewMeta.domain}</p>
                {previewMeta.description && (
                  <p className="text-[#666] dark:text-[#a1a1a1] line-clamp-2 mt-0.5">
                    {previewMeta.description}
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="field-label">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={handleChange("title")}
              placeholder="e.g. React Documentation"
              className={fieldClass(errors.title)}
            />
            {errors.title && (
              <p className="text-xs text-black/60 dark:text-white/60 mt-1.5">{errors.title}</p>
            )}
          </div>

          <div>
            <label className="field-label">
              Description{" "}
              <span className="text-black/60 dark:text-white/60">
                (optional, improves AI search)
              </span>
            </label>
            <textarea
              rows={2}
              maxLength={1000}
              value={form.description}
              onChange={handleChange("description")}
              placeholder="Brief summary of what this resource covers..."
              className="field resize-none"
            />
          </div>

          <div>
            <label className="field-label">Folder</label>
            {!isNewFolder ? (
              <select
                value={form.folder}
                onChange={handleFolderSelect}
                className="field cursor-pointer"
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
                  className={`flex-1 ${fieldClass(errors.folder)}`}
                />
                {folders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewFolder(false);
                      setForm((prev) => ({ ...prev, folder: folders[0] }));
                    }}
                    className="btn-secondary h-10 px-3.5"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
            {errors.folder && (
              <p className="text-xs text-black/60 dark:text-white/60 mt-1.5">{errors.folder}</p>
            )}
          </div>

          <div>
            <label className="field-label">
              Tags <span className="text-black/60 dark:text-white/60">(comma separated)</span>
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={handleChange("tags")}
              placeholder="react, docs, frontend"
              className="field"
            />
          </div>

          {!isEditMode && (
            <p className="text-xs text-[#666] dark:text-[#a1a1a1] leading-relaxed">
              After saving, NestLink automatically extracts webpage details, generates an AI
              summary, and suggests tags &amp; folders in the background.
            </p>
          )}

          <div className="flex gap-3 mt-1">
            <button type="button" onClick={onClose} className="btn-secondary h-10 flex-1">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary h-10 flex-1">
              {submitting ? "Saving..." : isEditMode ? "Save changes" : "Add bookmark"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
