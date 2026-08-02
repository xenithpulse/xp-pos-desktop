"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  MdOutlineMarkEmailRead,
  MdInfoOutline,
  MdChevronLeft,
  MdChevronRight,
  MdRefresh,
} from "react-icons/md";
import { Notification } from "../types";
import { NotificationItemMobile } from "./notificationItem";

interface PaginatedResponse {
  notifications: Notification[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export default function NotificationsMobile() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [markingAll, setMarkingAll] = useState(false);
  const [markingSingle, setMarkingSingle] = useState<Record<string, boolean>>({});

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize] = useState(15);

  // ---------------- Fetch Notifications with Pagination ----------------
  const fetchNotifications = useCallback(async (page: number, isRefresh = false) => {
    try {
      if (isRefresh) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });

      const res = await fetch(`/api/notifications?${params}`);
      if (!res.ok) throw new Error("Failed to fetch notifications");

      const data: PaginatedResponse = await res.json();
      setNotifications(data.notifications || []);
      setTotalPages(data.totalPages);
      setTotalCount(data.total);
      setCurrentPage(data.page);
    } catch (e) {
      if (e instanceof Error) setError(e.message);
      else setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [pageSize]);

  // Initial load
  useEffect(() => {
    fetchNotifications(1, true);
  }, [fetchNotifications]);

  // ---------------- Handlers ----------------
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
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
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
      setNotifications((prev) =>
        prev.map((n) => (n.visible === false ? n : { ...n, isRead: true }))
      );
    } catch (e) {
      console.error("Failed to mark all as read", e);
    } finally {
      setMarkingAll(false);
    }
  }

  function handlePageChange(page: number) {
    if (page < 1 || page > totalPages || loadingMore) return;
    fetchNotifications(page);
    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const unreadCount = notifications.filter(
    (n) => n.visible !== false && !n.isRead
  ).length;

  // ---------------- UI ----------------
  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-t-transparent border-cyan-500" />
          <p className="mt-3 text-sm text-gray-400">Loading notifications...</p>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="p-4 bg-slate-900 min-h-screen flex flex-col items-center justify-center">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <MdInfoOutline className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-400">Error: {error}</p>
          <button
            onClick={() => fetchNotifications(1, true)}
            className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-900 text-white px-3 py-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mt-14 mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight">Notifications</h1>
          {unreadCount > 0 && (
            <span className="bg-cyan-500/20 text-cyan-400 text-xs font-semibold px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchNotifications(currentPage, true)}
            className="p-2 rounded-lg bg-slate-800 text-gray-400 active:bg-slate-700"
            aria-label="Refresh"
          >
            <MdRefresh className="w-5 h-5" />
          </button>
          <button
            onClick={handleMarkAllNow}
            disabled={markingAll || unreadCount === 0}
            className="px-3 py-2 text-xs bg-cyan-500/10 text-cyan-400 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
          >
            <MdOutlineMarkEmailRead className="w-4 h-4" />
            {markingAll ? "..." : "Mark All"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="text-xs text-gray-500 mb-4">
        {totalCount} notifications • Page {currentPage} of {totalPages}
      </div>

      {/* Notification List */}
      <div className="space-y-2">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <MdInfoOutline className="w-12 h-12 mb-3 text-gray-600" />
            <p className="text-sm text-center font-medium">No notifications</p>
            <p className="text-xs text-center mt-1">Check back later for updates</p>
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationItemMobile
              key={n._id}
              notification={n}
              isExpanded={!!expanded[n._id]}
              toggleExpand={toggleExpand}
              markSingleRead={markSingleRead}
              markingSingle={markingSingle}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-white/5 px-4 py-3">
          <div className="flex items-center justify-between max-w-md mx-auto">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || loadingMore}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-800 text-gray-400 disabled:opacity-50 active:bg-slate-700"
            >
              <MdChevronLeft className="w-5 h-5" />
              <span className="text-sm">Prev</span>
            </button>

            <div className="flex items-center gap-1">
              {loadingMore ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-cyan-500 border-t-transparent" />
              ) : (
                <span className="text-sm text-gray-400">
                  {currentPage} / {totalPages}
                </span>
              )}
            </div>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages || loadingMore}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-800 text-gray-400 disabled:opacity-50 active:bg-slate-700"
            >
              <span className="text-sm">Next</span>
              <MdChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
