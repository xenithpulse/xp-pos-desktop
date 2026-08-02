"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MdOutlineMarkEmailRead,
  MdInfoOutline,
  MdSearch,
  MdClose,
  MdDeleteOutline,
  MdDeleteForever,
  MdChevronLeft,
  MdChevronRight,
  MdFilterList,
  MdRefresh,
} from "react-icons/md";
import { Notification, NotificationType } from "./types";
import { NotificationItem } from "./utils";

interface PaginatedResponse {
  notifications: Notification[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  resources: { name: string; count: number }[];
}

export default function NotificationsDesktop() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [markingAll, setMarkingAll] = useState(false);
  const [markingSingle, setMarkingSingle] = useState<Record<string, boolean>>({});
  const [deletingSingle, setDeletingSingle] = useState<Record<string, boolean>>({});
  const [deletingAll, setDeletingAll] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize] = useState(15);

  // Filters
  const [selectedType, setSelectedType] = useState<"All" | NotificationType>("All");
  const [selectedResource, setSelectedResource] = useState<string>("All");
  const [sortedResources, setSortedResources] = useState<{ name: string; count: number }[]>([]);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Notification[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);

  // Fetch notifications with pagination
  const fetchNotifications = useCallback(async (page: number, type?: string, resource?: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (type && type !== "All") params.append("type", type);
      if (resource && resource !== "All") params.append("resource", resource);

      const res = await fetch(`/api/notifications?${params}`);
      if (!res.ok) throw new Error("Failed to fetch notifications");

      const data: PaginatedResponse = await res.json();
      setNotifications(data.notifications);
      setTotalPages(data.totalPages);
      setTotalCount(data.total);
      setCurrentPage(data.page);
      if (data.resources) {
        setSortedResources(data.resources);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  // Search notifications
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchMode(false);
      setSearchResults([]);
      return;
    }

    try {
      setIsSearching(true);
      setSearchMode(true);
      const params = new URLSearchParams({
        q: query,
        limit: "50",
      });

      const res = await fetch(`/api/notifications/search?${params}`);
      if (!res.ok) throw new Error("Search failed");

      const data = await res.json();
      setSearchResults(data.notifications || []);
      setSearchTotal(data.total || 0);
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  // Initial load
  useEffect(() => {
    fetchNotifications(1, selectedType, selectedResource);
  }, [fetchNotifications, selectedType, selectedResource]);

  // Handlers
  function toggleExpand(id: string) {
    setExpanded((s) => ({ ...s, [id]: !s[id] }));
  }

  async function markSingleRead(id: string) {
    setMarkingSingle((s) => ({ ...s, [id]: true }));
    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
      if (searchMode) {
        setSearchResults((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
      }
    } catch (e) {
      console.error("Failed to mark single as read", e);
    } finally {
      setMarkingSingle((s) => ({ ...s, [id]: false }));
    }
  }

  async function handleMarkAllNow() {
    setMarkingAll(true);
    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      setNotifications((prev) => prev.map((n) => (n.visible === false ? n : { ...n, isRead: true })));
      if (searchMode) {
        setSearchResults((prev) => prev.map((n) => (n.visible === false ? n : { ...n, isRead: true })));
      }
    } catch (e) {
      console.error("Failed to mark all as read", e);
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleDeleteSingle(id: string) {
    setDeletingSingle((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/notifications?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");

      setNotifications((prev) => prev.filter((n) => n._id !== id));
      setSearchResults((prev) => prev.filter((n) => n._id !== id));
      setTotalCount((c) => c - 1);
    } catch (e) {
      console.error("Failed to delete notification", e);
    } finally {
      setDeletingSingle((s) => ({ ...s, [id]: false }));
    }
  }

  async function handleDeleteAll() {
    setDeletingAll(true);
    try {
      const res = await fetch("/api/notifications?deleteAll=true", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete all");

      setNotifications([]);
      setSearchResults([]);
      setTotalCount(0);
      setTotalPages(1);
      setCurrentPage(1);
      setShowDeleteAllConfirm(false);
    } catch (e) {
      console.error("Failed to delete all notifications", e);
    } finally {
      setDeletingAll(false);
    }
  }

  function handlePageChange(page: number) {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    fetchNotifications(page, selectedType, selectedResource);
  }

  function handleFilterChange(type: "All" | NotificationType, resource: string) {
    setSelectedType(type);
    setSelectedResource(resource);
    setCurrentPage(1);
  }

  function clearSearch() {
    setSearchQuery("");
    setSearchMode(false);
    setSearchResults([]);
  }

  const displayNotifications = searchMode ? searchResults : notifications;
  const unreadCount = displayNotifications.filter((n) => n.visible !== false && !n.isRead).length;

  // Loading state
  if (loading && notifications.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center"
        >
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent" />
          <p className="mt-4 text-lg text-gray-400">Loading notifications...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center bg-slate-900 min-h-screen">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 max-w-md mx-auto">
          <MdInfoOutline className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400 text-lg">Error: {error}</p>
          <button
            onClick={() => fetchNotifications(1)}
            className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 h-18 bg-slate-900/95 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-9xl mx-auto px-6 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Title & Stats */}
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <span className="bg-cyan-500/20 text-cyan-400 text-xs font-semibold px-2.5 py-1 rounded-full">
                    {unreadCount} Unread
                  </span>
                )}
                <span className="text-gray-500 text-sm">
                  {totalCount} total
                </span>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative flex-1 max-w-md">
              <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search notifications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  <MdClose className="w-5 h-5" />
                </button>
              )}
              {isSearching && (
                <div className="absolute right-10 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-cyan-500 border-t-transparent" />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchNotifications(currentPage, selectedType, selectedResource)}
                className="p-2.5 rounded-xl bg-slate-800 text-gray-400 hover:text-white hover:bg-slate-700 transition-colors"
                title="Refresh"
              >
                <MdRefresh className="w-5 h-5" />
              </button>
              <button
                onClick={handleMarkAllNow}
                disabled={markingAll || unreadCount === 0}
                className="px-4 py-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 text-sm font-medium flex items-center gap-2 hover:bg-cyan-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <MdOutlineMarkEmailRead className="w-4 h-4" />
                {markingAll ? "Marking..." : "Mark All Read"}
              </button>
              <button
                onClick={() => setShowDeleteAllConfirm(true)}
                disabled={totalCount === 0}
                className="px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 text-sm font-medium flex items-center gap-2 hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <MdDeleteForever className="w-4 h-4" />
                Delete All
              </button>
            </div>
          </div>

          {/* Search results indicator */}
          {searchMode && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-center gap-2 text-sm text-gray-400"
            >
              <MdSearch className="w-4 h-4" />
              <span>Found {searchTotal} results for &quot;{searchQuery}&quot;</span>
              <button onClick={clearSearch} className="text-cyan-400 hover:underline ml-2">
                Clear search
              </button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-8xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Filters */}
          <div className="lg:col-span-1">
            <div className="sticky top-28 space-y-6">
              {/* Type Filter */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                <div className="flex items-center gap-2 mb-3">
                  <MdFilterList className="w-4 h-4 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Type</h2>
                </div>
                <div className="space-y-1">
                  {["All", "success", "error", "info", "warning"].map((type) => (
                    <button
                      key={type}
                      onClick={() => handleFilterChange(type as "All" | NotificationType, selectedResource)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                        selectedType === type
                          ? "bg-cyan-500/20 text-cyan-400 font-medium"
                          : "text-gray-400 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            type === "success" ? "bg-green-500" :
                            type === "error" ? "bg-red-500" :
                            type === "warning" ? "bg-yellow-500" :
                            type === "info" ? "bg-blue-500" : "bg-gray-500"
                          }`}
                        />
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Resource Filter */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Resource</h2>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  <button
                    onClick={() => handleFilterChange(selectedType, "All")}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                      selectedResource === "All"
                        ? "bg-cyan-500/20 text-cyan-400 font-medium"
                        : "text-gray-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    All Resources
                  </button>
                  {sortedResources.map((resource) => (
                    <button
                      key={resource.name}
                      onClick={() => handleFilterChange(selectedType, resource.name)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 flex justify-between items-center ${
                        selectedResource === resource.name
                          ? "bg-cyan-500/20 text-cyan-400 font-medium"
                          : "text-gray-400 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className="truncate">{resource.name}</span>
                      <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full ml-2">
                        {resource.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Notifications List */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              {displayNotifications.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-20 text-gray-500"
                >
                  <MdInfoOutline className="w-16 h-16 mb-4 text-gray-600" />
                  <p className="text-lg font-medium">No notifications found</p>
                  <p className="text-sm mt-2">
                    {searchMode ? "Try a different search term" : "Check back later for updates"}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  {displayNotifications.map((n, index) => (
                    <motion.div
                      key={n._id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                    >
                      <NotificationItem
                        notification={n}
                        isExpanded={!!expanded[n._id]}
                        toggleExpand={toggleExpand}
                        markSingleRead={markSingleRead}
                        markingSingle={markingSingle}
                        onDelete={handleDeleteSingle}
                        isDeleting={!!deletingSingle[n._id]}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pagination */}
            {!searchMode && totalPages > 1 && (
              <div className="mt-8 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg bg-slate-800 text-gray-400 hover:text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <MdChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let page: number;
                      if (totalPages <= 5) {
                        page = i + 1;
                      } else if (currentPage <= 3) {
                        page = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        page = totalPages - 4 + i;
                      } else {
                        page = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={page}
                          onClick={() => handlePageChange(page)}
                          className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                            currentPage === page
                              ? "bg-cyan-500 text-white"
                              : "bg-slate-800 text-gray-400 hover:text-white hover:bg-slate-700"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg bg-slate-800 text-gray-400 hover:text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <MdChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete All Confirmation Modal */}
      <AnimatePresence>
        {showDeleteAllConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDeleteAllConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-800 border border-white/10 rounded-2xl p-6 max-w-md mx-4 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-full bg-red-500/10">
                  <MdDeleteForever className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Delete All Notifications</h3>
              </div>
              <p className="text-gray-400 mb-6">
                Are you sure you want to delete all {totalCount} notifications? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteAllConfirm(false)}
                  className="px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAll}
                  disabled={deletingAll}
                  className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {deletingAll ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <MdDeleteForever className="w-4 h-4" />
                      Delete All
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

