import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach token from localStorage on every request (in case a page reload
// happens before AuthContext has re-set the default header)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("tabshelf_token");
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If a request ever comes back 401, the token is invalid/expired — clear it
// and send the user back to login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("tabshelf_token");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ---- Auth ----
export const signupRequest = (payload) => api.post("/auth/signup", payload).then((res) => res.data);
export const loginRequest = (payload) => api.post("/auth/login", payload).then((res) => res.data);
export const getMeRequest = () => api.get("/auth/me").then((res) => res.data);
export const forgotPasswordRequest = (email) =>
  api.post("/auth/forgot-password", { email }).then((res) => res.data);
export const resetPasswordRequest = (token, password) =>
  api.put(`/auth/reset-password/${token}`, { password }).then((res) => res.data);

// ---- Folders ----
export const getFolders = () => api.get("/folders").then((res) => res.data);
export const createFolder = (name, description = "") =>
  api.post("/folders", { name, description }).then((res) => res.data);
export const deleteFolder = (id) => api.delete(`/folders/${id}`).then((res) => res.data);

// ---- Bookmarks (Phase 1) ----
// Returns { bookmarks, pagination: { total, page, limit, pages } }
export const getBookmarks = ({ search = "", folder = "", tag = "", page = 1, limit = 9 } = {}) => {
  const params = { page, limit };
  if (search) params.search = search;
  if (folder && folder !== "All") params.folder = folder;
  if (tag && tag !== "All") params.tag = tag;
  return api.get("/bookmarks", { params }).then((res) => res.data);
};

// Returns { query, results, count, limit }
export const semanticSearchBookmarks = ({ q = "", limit = 12, folder = "", tag = "" } = {}) => {
  const params = { q, limit };
  if (folder && folder !== "All") params.folder = folder;
  if (tag && tag !== "All") params.tag = tag;
  return api.get("/bookmarks/semantic-search", { params }).then((res) => res.data);
};

export const getTags = () => api.get("/bookmarks/tags").then((res) => res.data);

export const createBookmark = (bookmark) =>
  api.post("/bookmarks", bookmark).then((res) => res.data);

export const updateBookmark = (id, bookmark) =>
  api.put(`/bookmarks/${id}`, bookmark).then((res) => res.data);

export const deleteBookmark = (id) =>
  api.delete(`/bookmarks/${id}`).then((res) => res.data);

// ---- AI Insights & Webpage Understanding (Phase 2) ----
export const extractUrlPreview = (url) =>
  api.post("/bookmarks/extract-preview", { url }).then((res) => res.data);

export const getBookmarkAiInsights = (id) =>
  api.get(`/bookmarks/${id}/ai-insights`).then((res) => res.data);

export const getBookmarkProcessingStatus = (id) =>
  api.get(`/bookmarks/${id}/processing-status`).then((res) => res.data);

export const triggerBookmarkProcessing = (id, options = {}) =>
  api.post(`/bookmarks/${id}/process`, options).then((res) => res.data);

export const extractBookmarkMetadata = (id, options = {}) =>
  api.post(`/bookmarks/${id}/extract`, options).then((res) => res.data);

export const regenerateBookmarkSummary = (id) =>
  api.post(`/bookmarks/${id}/summary/regenerate`).then((res) => res.data);

export const suggestBookmarkTags = (id) =>
  api.post(`/bookmarks/${id}/tags/suggest`).then((res) => res.data);

export const respondToTagSuggestions = (id, payload) =>
  api.patch(`/bookmarks/${id}/tags/suggestions`, payload).then((res) => res.data);

export const recommendBookmarkFolder = (id) =>
  api.post(`/bookmarks/${id}/folder/recommend`).then((res) => res.data);

export const respondToFolderRecommendation = (id, payload) =>
  api.patch(`/bookmarks/${id}/folder/recommendation`, payload).then((res) => res.data);

export default api;
