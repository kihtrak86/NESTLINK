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
  semanticSearchBookmarks,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  getFolders,
  deleteFolder,
  getTags,
} from "../services/api";

const PAGE_SIZE = 9;
const SEMANTIC_LIMIT = 12;

export default function Home() {
  const [bookmarks, setBookmarks] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [folderRecords, setFolderRecords] = useState([]); // full { _id, name } objects
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState("keyword"); // "keyword" | "semantic"
  const [folder, setFolder] = useState("All");
  const [tag, setTag] = useState("All");
  const [page, setPage] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState(null);
  const [isManageFoldersOpen, setIsManageFoldersOpen] = useState(false);

  const folderNames = useMemo(() => folderRecords.map((f) => f.name), [folderRecords]);
  const isSemanticActive = searchMode === "semantic" && Boolean(search.trim());

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

      if (searchMode === "semantic" && search.trim()) {
        const data = await semanticSearchBookmarks({
          q: search.trim(),
          limit: SEMANTIC_LIMIT,
          folder,
          tag,
        });
        setBookmarks(data.results || []);
        setPagination({
          total: data.count ?? (data.results ? data.results.length : 0),
          page: 1,
          pages: 1,
        });
      } else {
        const data = await getBookmarks({
          search: searchMode === "keyword" ? search : "",
          folder,
          tag,
          page,
          limit: PAGE_SIZE,
        });
        setBookmarks(data.bookmarks);
        setPagination(data.pagination);
      }
    } catch (err) {
      const serverMessage = err?.response?.data?.message;
      if (searchMode === "semantic" && search.trim()) {
        setError(
          serverMessage ||
            "AI Semantic Search is temporarily unavailable. You can switch to Keyword Search anytime."
        );
      } else {
        setError(serverMessage || "Failed to load bookmarks. Is the backend server running?");
      }
    } finally {
      setLoading(false);
    }
  }, [search, searchMode, folder, tag, page]);

  useEffect(() => {
    fetchFolders();
    fetchTags();
  }, [fetchFolders, fetchTags]);

  // Reset to page 1 whenever a filter or search mode changes
  useEffect(() => {
    setPage(1);
  }, [search, searchMode, folder, tag]);

  // Debounce search input (slightly longer in semantic mode to avoid excess embedding calls)
  useEffect(() => {
    const delay = searchMode === "semantic" && search.trim() ? 400 : 250;
    const timeout = setTimeout(() => {
      fetchBookmarks();
    }, delay);
    return () => clearTimeout(timeout);
  }, [fetchBookmarks, searchMode, search]);

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
      setBookmarks((prev) =>
        prev.map((b) => (b._id === id ? { ...updated, score: b.score } : b))
      );
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
    () => Boolean(search.trim() || folder !== "All" || tag !== "All"),
    [search, folder, tag]
  );

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
      <Navbar onAddClick={handleOpenAdd} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-black dark:text-white">
            Your Bookmarks
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            {isSemanticActive
              ? `${bookmarks.length} AI semantic match${bookmarks.length !== 1 ? "es" : ""}`
              : `${pagination.total} saved link${pagination.total !== 1 ? "s" : ""}`}
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-3 mb-8">
          <SearchBar
            value={search}
            onChange={setSearch}
            mode={searchMode}
            onModeChange={setSearchMode}
            onSubmit={fetchBookmarks}
            loading={loading && isSemanticActive}
          />
          <div className="flex gap-2">
            <FolderFilter value={folder} onChange={setFolder} folders={folderNames} />
            <TagFilter value={tag} onChange={setTag} tags={tags} />
            <button
              onClick={() => setIsManageFoldersOpen(true)}
              title="Manage folders"
              aria-label="Manage folders"
              className="w-11 flex-shrink-0 flex items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-neutral-600 dark:text-neutral-300 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {searchMode === "semantic" && !search.trim() && (
          <div className="mb-6 -mt-4 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-4 py-2.5">
            AI Semantic Search is active — type a natural-language query to find bookmarks by meaning, even without exact keyword matches.
          </div>
        )}

        {(folder !== "All" || tag !== "All" || isSemanticActive) && (
          <div className="flex flex-wrap items-center gap-2 mb-6 -mt-4">
            {isSemanticActive && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-black text-white dark:bg-white dark:text-black px-2.5 py-1 rounded-full">
                AI ranked by meaning
              </span>
            )}
            {folder !== "All" && (
              <button
                onClick={() => setFolder("All")}
                className="inline-flex items-center gap-1 text-xs font-medium border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-black dark:text-white px-2.5 py-1 rounded-full hover:border-black dark:hover:border-white"
              >
                {folder} &times;
              </button>
            )}
            {tag !== "All" && (
              <button
                onClick={() => setTag("All")}
                className="inline-flex items-center gap-1 text-xs font-medium border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-black dark:text-white px-2.5 py-1 rounded-full hover:border-black dark:hover:border-white"
              >
                #{tag} &times;
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="border border-black dark:border-white bg-neutral-50 dark:bg-neutral-950 text-black dark:text-white text-sm px-4 py-3 rounded-lg mb-6 flex flex-wrap items-center justify-between gap-2">
            <span>{error}</span>
            {searchMode === "semantic" && (
              <button
                type="button"
                onClick={() => setSearchMode("keyword")}
                className="text-xs font-semibold underline hover:no-underline"
              >
                Switch to Keyword Search
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-48 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 animate-pulse"
              />
            ))}
          </div>
        ) : bookmarks.length === 0 ? (
          <EmptyState hasFilters={hasFilters} searchMode={searchMode} />
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
            {!isSemanticActive && (
              <Pagination
                page={pagination.page}
                pages={pagination.pages}
                total={pagination.total}
                onPageChange={setPage}
              />
            )}
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
