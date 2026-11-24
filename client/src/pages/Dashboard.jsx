import { useState, useEffect, useCallback, useMemo } from "react";
import Navbar from "../components/Navbar";
import SearchBar from "../components/SearchBar";
import FolderGrid from "../components/FolderGrid";
import TagFilter from "../components/TagFilter";
import Pagination from "../components/Pagination";
import BookmarkCard from "../components/BookmarkCard";
import BookmarkModal from "../components/BookmarkModal";
import BookmarkDetailsModal from "../components/BookmarkDetailsModal";
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
  respondToTagSuggestions,
  respondToFolderRecommendation,
  getBookmarkAiInsights,
} from "../services/api";
import { isProcessingActive } from "../utils/aiInsightsHelpers";

const PAGE_SIZE = 9;
const SEMANTIC_LIMIT = 12;

export default function Dashboard() {
  const [bookmarks, setBookmarks] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [folderRecords, setFolderRecords] = useState([]); // full { _id, name } objects
  const [tags, setTags] = useState([]);
  const [folderCounts, setFolderCounts] = useState({});
  const [allCount, setAllCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState("keyword"); // "keyword" | "semantic"
  const [folder, setFolder] = useState("All");
  const [tag, setTag] = useState("All");
  const [page, setPage] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState(null);
  const [selectedDetailsId, setSelectedDetailsId] = useState(null);
  const [isManageFoldersOpen, setIsManageFoldersOpen] = useState(false);

  const folderNames = useMemo(() => folderRecords.map((f) => f.name), [folderRecords]);
  const isSemanticActive = searchMode === "semantic" && Boolean(search.trim());
  const selectedDetailsBookmark = useMemo(
    () => bookmarks.find((b) => b._id === selectedDetailsId) || null,
    [bookmarks, selectedDetailsId]
  );

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

  const fetchCounts = useCallback(async (names) => {
    try {
      const [all, ...rest] = await Promise.all([
        getBookmarks({ folder: "All", limit: 1 }),
        ...names.map((n) => getBookmarks({ folder: n, limit: 1 })),
      ]);
      setAllCount(all.pagination.total);
      setFolderCounts(Object.fromEntries(names.map((n, i) => [n, rest[i].pagination.total])));
    } catch (err) {
      // Non-fatal: counts just stay blank
    }
  }, []);

  useEffect(() => {
    fetchCounts(folderNames);
  }, [folderNames, fetchCounts]);

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

  // Poll active background AI jobs without hammering the API when idle
  const activeJobIds = useMemo(
    () =>
      bookmarks
        .filter((b) => isProcessingActive(b.processingStatus))
        .map((b) => b._id)
        .join(","),
    [bookmarks]
  );

  useEffect(() => {
    if (!activeJobIds) return undefined;
    const ids = activeJobIds.split(",").filter(Boolean);

    const interval = setInterval(async () => {
      try {
        const updates = await Promise.all(
          ids.map((id) => getBookmarkAiInsights(id).catch(() => null))
        );
        const byId = new Map(
          updates.filter(Boolean).map((u) => [u.bookmarkId, u])
        );
        if (byId.size > 0) {
          setBookmarks((prev) =>
            prev.map((b) => {
              const insight = byId.get(b._id);
              if (!insight) return b;
              return {
                ...b,
                processingStatus: insight.processingStatus,
                lastProcessedAt: insight.lastProcessedAt,
                extractedMetadata: insight.extractedMetadata,
                aiSummary: insight.aiSummary,
                suggestedTags: insight.suggestedTags,
                suggestedFolder: insight.suggestedFolder,
                aiProcessingError: insight.aiProcessingError,
              };
            })
          );
        }
      } catch {
        // Non-fatal polling error; next tick will retry
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [activeJobIds]);

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

  const handleBookmarkUpdated = useCallback((updatedBookmark) => {
    if (!updatedBookmark?._id) return;
    setBookmarks((prev) =>
      prev.map((b) => (b._id === updatedBookmark._id ? { ...updatedBookmark, score: b.score } : b))
    );
  }, []);

  const handleSave = async (payload, id) => {
    if (id) {
      const updated = await updateBookmark(id, payload);
      handleBookmarkUpdated(updated);
    } else {
      await createBookmark(payload);
      fetchBookmarks(); // refetch so pagination/sort stays correct
    }
    fetchFolders();
    fetchTags();
  };

  const handleRespondTag = async (bookmarkId, payload) => {
    const data = await respondToTagSuggestions(bookmarkId, payload);
    if (data?.bookmark) {
      handleBookmarkUpdated(data.bookmark);
      fetchTags();
    }
  };

  const handleRespondFolder = async (bookmarkId, payload) => {
    const data = await respondToFolderRecommendation(bookmarkId, payload);
    if (data?.bookmark) {
      handleBookmarkUpdated(data.bookmark);
      fetchFolders();
    }
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm("Delete this bookmark? This cannot be undone.");
    if (!confirmed) return;

    const prevBookmarks = bookmarks;
    setBookmarks((prev) => prev.filter((b) => b._id !== id)); // optimistic update
    if (selectedDetailsId === id) {
      setSelectedDetailsId(null);
    }

    try {
      await deleteBookmark(id);
      fetchCounts(folderNames);
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
    <div className="relative min-h-screen text-[#171717] dark:text-[#ededed]">
      <Navbar onAddClick={handleOpenAdd} />

      <main className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="mb-8 flex items-end justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.04em]">
              Your bookmarks
            </h1>
            <p className="text-sm text-[#666] dark:text-[#a1a1a1] mt-2">
              {isSemanticActive
                ? `${bookmarks.length} AI semantic match${bookmarks.length !== 1 ? "es" : ""}`
                : `${pagination.total} saved link${pagination.total !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        <FolderGrid
          value={folder}
          onChange={setFolder}
          folders={folderNames}
          counts={folderCounts}
          total={allCount}
          onManage={() => setIsManageFoldersOpen(true)}
        />

        <div className="flex flex-col lg:flex-row gap-3 mb-6">
          <SearchBar
            value={search}
            onChange={setSearch}
            mode={searchMode}
            onModeChange={setSearchMode}
            onSubmit={fetchBookmarks}
            loading={loading && isSemanticActive}
          />
          <div className="flex gap-2">
            <TagFilter value={tag} onChange={setTag} tags={tags} />
          </div>
        </div>

        {searchMode === "semantic" && !search.trim() && (
          <div className="mb-6 text-[13px] text-[#666] dark:text-[#a1a1a1] border border-[#ebebeb] dark:border-[#242424] bg-white dark:bg-[#0a0a0a] rounded-lg px-4 py-3">
            AI semantic search is active. Describe what you&apos;re looking for and results are
            ranked by meaning, even without exact keyword matches.
          </div>
        )}

        {(folder !== "All" || tag !== "All" || isSemanticActive) && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {isSemanticActive && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-[#8e4ec6]/10 text-[#8e4ec6] border border-[#8e4ec6]/30 px-2.5 py-1 rounded-full">
                AI ranked by meaning
              </span>
            )}
            {folder !== "All" && (
              <button
                onClick={() => setFolder("All")}
                className="chip hover:border-[#8f8f8f] transition-colors"
              >
                {folder} &times;
              </button>
            )}
            {tag !== "All" && (
              <button
                onClick={() => setTag("All")}
                className="chip hover:border-[#8f8f8f] transition-colors"
              >
                #{tag} &times;
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="notice mb-6 flex flex-wrap items-center justify-between gap-2">
            <span>{error}</span>
            {searchMode === "semantic" && (
              <button
                type="button"
                onClick={() => setSearchMode("keyword")}
                className="text-xs font-semibold underline underline-offset-4 hover:no-underline"
              >
                Switch to keyword search
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-52 rounded-xl border border-[#ebebeb] dark:border-[#242424] bg-white dark:bg-[#0a0a0a] animate-pulse"
              />
            ))}
          </div>
        ) : bookmarks.length === 0 ? (
          <EmptyState hasFilters={hasFilters} searchMode={searchMode} onAddClick={handleOpenAdd} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {bookmarks.map((bookmark, i) => (
                <BookmarkCard
                  key={bookmark._id}
                  bookmark={bookmark}
                  index={i}
                  onEdit={handleOpenEdit}
                  onDelete={handleDelete}
                  onViewDetails={(bm) => setSelectedDetailsId(bm._id)}
                  onRespondTag={handleRespondTag}
                  onRespondFolder={handleRespondFolder}
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

      <BookmarkDetailsModal
        bookmark={selectedDetailsBookmark}
        isOpen={Boolean(selectedDetailsBookmark)}
        onClose={() => setSelectedDetailsId(null)}
        onBookmarkUpdated={handleBookmarkUpdated}
        onRespondTag={handleRespondTag}
        onRespondFolder={handleRespondFolder}
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
