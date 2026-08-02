"use client";

import React, { useMemo } from "react";
import { Notification } from "../types";
import {
  MdExpandMore,
  MdExpandLess,
  MdOutlineMarkEmailRead,
  MdCheckCircleOutline,
  MdErrorOutline,
  MdWarningAmber,
  MdInfoOutline,
  MdContentCopy,
} from "react-icons/md";

export const NotificationItemMobile: React.FC<{
  notification: Notification;
  isExpanded: boolean;
  toggleExpand: (id: string) => void;
  markSingleRead: (id: string) => Promise<void>;
  markingSingle: Record<string, boolean>;
}> = ({
  notification,
  isExpanded,
  toggleExpand,
  markSingleRead,
  markingSingle,
}) => {
  const { _id, type, message, isRead, createdAt } = notification;

  const iconMap = {
    success: <MdCheckCircleOutline className="text-green-400" />,
    error: <MdErrorOutline className="text-red-400" />,
    warning: <MdWarningAmber className="text-yellow-400" />,
    info: <MdInfoOutline className="text-blue-400" />,
  };

  const typeColorMap = {
    success: "bg-green-600/30",
    error: "bg-red-600/30",
    warning: "bg-yellow-600/30",
    info: "bg-blue-600/30",
  };

  const title = useMemo(() => {
    const mainTitle =
      message?.split("\n")[0] || "Notification";
    return mainTitle.length > 45
      ? `${mainTitle.substring(0, 45)}...`
      : mainTitle;
  }, [message]);

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      if (diff < 1)
        return new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(d);
      if (diff < 2) return "Yesterday";
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(d);
    } catch {
      return iso;
    }
  };

  const lines =
    message
      ?.split("\n")
      .map((l) => l.trim())
      .filter(Boolean) ?? [];

  return (
    <div
      key={_id}
      className={`rounded-xl border border-gray-700 overflow-hidden mb-3 transition-all duration-300 ${
        isRead ? "bg-gray-800/70" : "bg-gray-700/80 ring-1 ring-blue-500/40"
      }`}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between p-3 active:bg-gray-600/40"
        onClick={() => toggleExpand(_id)}
      >
        <div className="flex items-start gap-3 flex-1">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${typeColorMap[type]}`}
          >
            {iconMap[type] || <MdInfoOutline />}
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-start gap-2">
              <h3 className="text-sm font-semibold leading-tight text-white">
                {title}
              </h3>
              {!isRead && (
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 mt-1" />
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {formatDate(createdAt)}
            </p>
            {!isExpanded && (
              <p className="text-xs text-gray-300 mt-1 line-clamp-2">
                {lines.slice(0, 2).join(" ")}
              </p>
            )}
          </div>
        </div>

        <div className="ml-2 flex flex-col items-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(_id);
            }}
            className="p-1 rounded-full text-gray-400 hover:text-white"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <MdExpandLess /> : <MdExpandMore />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-3">
          <div className="text-xs text-gray-200 leading-snug mt-2 space-y-1">
            {lines.map((line, i) => (
              <p key={i} className="leading-snug">
                {line}
              </p>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {!isRead && (
              <button
                onClick={async () => await markSingleRead(_id)}
                disabled={!!markingSingle[_id]}
                className="flex items-center gap-1 px-3 py-1 rounded-full border border-gray-600 text-xs text-gray-200 active:bg-gray-600 disabled:opacity-50"
              >
                <MdOutlineMarkEmailRead className="text-base" />
                {markingSingle[_id] ? "..." : "Mark Read"}
              </button>
            )}

            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(message || "");
                } catch (err) {
                  console.error("copy failed", err);
                }
              }}
              className="flex items-center gap-1 px-3 py-1 rounded-full border border-gray-600 text-xs text-gray-200 active:bg-gray-600"
            >
              <MdContentCopy className="text-base" />
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
