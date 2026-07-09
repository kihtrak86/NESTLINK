import { useState, useEffect, useCallback, useMemo } from "react";
import Navbar from "../components/Navbar";
import SearchBar from "../components/SearchBar";
import FolderFilter from "../components/FolderFilter";
import TagFilter from "../components/TagFilter";
import Pagination from "../components/Pagination";
import BookmarkCard from "../components/BookmarkCard";
import BookmarkModal from "../components/BookmarkModal";
import ManageFoldersModal from "../components/ManageFoldersModal";
import EmptyState from "../components/EmptyState";
import {
  getBookmarks,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  getFolders,
  deleteFolder,
  getTags,
} from "../services/api";

const PAGE_SIZE = 9;

export default function Home() {
  const [bookmarks, setBookmarks] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [folderRecords, setFolderRecords] = useState([]); // full { _id, name } objects
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("All");
  const [tag, setTag] = useState("All");
  const [page, setPage] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState(null);
  const [isManageFoldersOpen, setIsManageFoldersOpen] = useState(false);

  const folderNames = useMemo(() => folderRecords.map((f) => f.name), [folderRecords]);

  const fetchFolders = useCallback(async () => {
    try {
      const data = await getFolders();
      setFolderRecords(data);
    } catch (err) {
      // Non-fatal: folder dropdown just falls back to empty/default list
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const data = await getTags();
      setTags(data);
    } catch (err) {
      // Non-fatal
    }
  }, []);

  const fetchBookmarks = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getBookmarks({ search, folder, tag, page, limit: PAGE_SIZE });
      setBookmarks(data.bookmarks);
      setPagination(data.pagination);
    } catch (err) {
      setError("Failed to load bookmarks. Is the backend server running?");
    } finally {
      setLoading(false);
    }
  }, [search, folder, tag, page]);

  useEffect(() => {
    fetchFolders();
    fetchTags();
  }, [fetchFolders, fetchTags]);

  // Reset to page 1 whenever a filter changes
  useEffect(() => {
    setPage(1);
  }, [search, folder, tag]);

  // Debounce search input to keep results "instant" but avoid spamming requests
  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchBookmarks();
    }, 250);
    return () => clearTimeout(timeout);
  }, [fetchBookmarks]);

  const handleOpenAdd = () => {
    setEditingBookmark(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (bookmark) => {
    setEditingBookmark(bookmark);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBookmark(null);
  };

  const handleSave = async (payload, id) => {
    if (id) {
      const updated = await updateBookmark(id, payload);
      setBookmarks((prev) => prev.map((b) => (b._id === id ? updated : b)));
    } else {
      await createBookmark(payload);
      fetchBookmarks(); // refetch so pagination/sort stays correct
    }
    fetchFolders();
    fetchTags();
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm("Delete this bookmark? This cannot be undone.");
    if (!confirmed) return;

    const prevBookmarks = bookmarks;
    setBookmarks((prev) => prev.filter((b) => b._id !== id)); // optimistic update

    try {
      await deleteBookmark(id);
      fetchTags();
    } catch (err) {
      setBookmarks(prevBookmarks); // rollback on failure
      alert("Failed to delete bookmark. Please try again.");
    }
  };

  const handleDeleteFolder = async (folderId) => {
    const deletedFolder = folderRecords.find((f) => f._id === folderId);
    await deleteFolder(folderId);

    setFolderRecords((prev) => prev.filter((f) => f._id !== folderId));

    if (deletedFolder && folder === deletedFolder.name) {
      setFolder("All");
    }

    fetchBookmarks();
  };

  const hasFilters = useMemo(
    () => Boolean(search || folder !== "All" || tag !== "All"),
    [search, folder, tag]
  );

  return (
    <div className="min-h-screen">
      <Navbar onAddClick={handleOpenAdd} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Your Bookmarks</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {pagination.total} saved link{pagination.total !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <SearchBar value={search} onChange={setSearch} />
          <div className="flex gap-2">
            <FolderFilter value={folder} onChange={setFolder} folders={folderNames} />
            <TagFilter value={tag} onChange={setTag} tags={tags} />
            <button
              onClick={() => setIsManageFoldersOpen(true)}
              title="Manage folders"
              aria-label="Manage folders"
              className="w-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-card transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {(folder !== "All" || tag !== "All") && (
          <div className="flex flex-wrap items-center gap-2 mb-6 -mt-4">
            {folder !== "All" && (
              <button
                onClick={() => setFolder("All")}
                className="inline-flex items-center gap-1 text-xs font-medium bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-2.5 py-1 rounded-full hover:bg-brand-100 dark:hover:bg-brand-900/50"
              >
                📁 {folder} &times;
              </button>
            )}
            {tag !== "All" && (
              <button
                onClick={() => setTag("All")}
                className="inline-flex items-center gap-1 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                #{tag} &times;
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-48 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse"
              />
            ))}
          </div>
        ) : bookmarks.length === 0 ? (
          <EmptyState hasFilters={hasFilters} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {bookmarks.map((bookmark) => (
                <BookmarkCard
                  key={bookmark._id}
                  bookmark={bookmark}
                  onEdit={handleOpenEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
            <Pagination
              page={pagination.page}
              pages={pagination.pages}
              total={pagination.total}
              onPageChange={setPage}
            />
          </>
        )}
      </main>

      <BookmarkModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        initialData={editingBookmark}
        folders={folderNames}
      />

      <ManageFoldersModal
        isOpen={isManageFoldersOpen}
        onClose={() => setIsManageFoldersOpen(false)}
        folders={folderRecords}
        onDelete={handleDeleteFolder}
      />
    </div>
  );
}
