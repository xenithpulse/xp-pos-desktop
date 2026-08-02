"use client"

import { Notification } from "./types";
import {
  MdOutlineMarkEmailRead,
  MdExpandMore,
  MdExpandLess,
  MdContentCopy,
  MdInfoOutline,
  MdWarningAmber,
  MdErrorOutline,
  MdCheckCircleOutline,
  MdDeleteOutline,
} from "react-icons/md";
import React, { useMemo } from "react";

export const NotificationItem: React.FC<{
  notification: Notification;
  isExpanded: boolean;
  toggleExpand: (id: string) => void;
  markSingleRead: (id: string) => Promise<void>;
  markingSingle: Record<string, boolean>;
  onDelete?: (id: string) => Promise<void>;
  isDeleting?: boolean;
}> = ({
  notification,
  isExpanded,
  toggleExpand,
  markSingleRead,
  markingSingle,
  onDelete,
  isDeleting = false,
}) => {
  const { _id, type, message, isRead, visible, createdAt, details, resource, createdBy, action} = notification;

  const iconMap = {
    success: <MdCheckCircleOutline className="text-green-400" />,
    error: <MdErrorOutline className="text-red-400" />,
    warning: <MdWarningAmber className="text-amber-400" />,
    info: <MdInfoOutline className="text-cyan-400" />,
  };

  const typeColorMap = {
    success: "bg-green-500/20",
    error: "bg-red-500/20",
    warning: "bg-amber-500/20",
    info: "bg-cyan-500/20",
  };

  const typeBorderMap = {
    success: "border-l-green-500",
    error: "border-l-red-500",
    warning: "border-l-amber-500",
    info: "border-l-cyan-500",
  };

  const title = useMemo(() => {
    const mainTitle = message.split("\n")[0] || (resource ? `${resource}` : "Notification");
    return mainTitle.length > 50 ? `${mainTitle.substring(0, 50)}...` : mainTitle;
  }, [message, resource]);

  const TIMEZONE = "Asia/Karachi";

  function getYMDInTZ(d: Date, timeZone = TIMEZONE) {
    // en-CA produces ISO-like date "YYYY-MM-DD" which is stable for parsing
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d); // e.g. "2025-09-11"
    const [year, month, day] = parts.split("-").map(Number);
    return { year, month, day };
  }

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    try {
      const date = new Date(iso);
      if (isNaN(date.getTime())) return iso;

      // Calendar-day in Pakistan timezone for both date and now
      const dateYMD = getYMDInTZ(date, TIMEZONE);
      const nowYMD = getYMDInTZ(new Date(), TIMEZONE);

      // Convert calendar-days to UTC midnight timestamps for diff
      const dateMidUtc = Date.UTC(dateYMD.year, dateYMD.month - 1, dateYMD.day);
      const nowMidUtc = Date.UTC(nowYMD.year, nowYMD.month - 1, nowYMD.day);

      const msPerDay = 24 * 60 * 60 * 1000;
      const diffInDays = Math.floor((nowMidUtc - dateMidUtc) / msPerDay);

      // Format time and fallback date in Pakistan TZ
      const timeStr = new Intl.DateTimeFormat("en-US", {
        timeZone: TIMEZONE,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(date);

      const longDate = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);

      if (diffInDays === 0) return `Today, ${timeStr}`;
      if (diffInDays === 1) return `Yesterday, ${timeStr}`;
      if (diffInDays > 1 && diffInDays < 7) return `${diffInDays} days ago`;
      // future dates or older
      return longDate;
    } catch {
      return iso;
    }
  };

  const renderDetailsOrMessage = () => {
    if (Array.isArray(details) && details.length > 0) {
      return (
        <ul className="list-disc ml-5 text-sm space-y-1">
          {details.map((d, i) => (
            <li key={i} className="leading-tight">
              <strong className="capitalize">{d.field}</strong>: <span className="text-gray-400">{d.oldValue ?? "N/A"}</span> &rarr; {d.newValue ?? "N/A"}
            </li>
          ))}
        </ul>
      );
    }
    const lines = (message || "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return <div className="text-sm text-gray-500 italic">(No message content)</div>;
    return (
      <ul className="list-disc ml-5 text-sm space-y-1 overflow-hidden text-ellipsis">
        {lines.map((line, idx) => (
          <li key={idx} className="leading-tight">{line}</li>
        ))}
      </ul>
    );
  };

  return (
    <div
      key={_id}
      className={`rounded-xl overflow-hidden transition-all duration-300 ease-in-out border-l-4 ${typeBorderMap[type]} ${
        isRead 
          ? "bg-slate-800/60 text-gray-400" 
          : "bg-slate-800 text-white shadow-lg shadow-black/20"
      } ${!visible ? "hidden" : "block"}`}
    >
      <div
        onClick={() => toggleExpand(_id)}
        className={`p-4 flex items-start justify-between cursor-pointer transition-colors duration-200 ${
          !isRead ? "hover:bg-slate-700/80" : "hover:bg-slate-700/50"
        }`}
      >
        <div className="flex-1 pr-4">
          <div className="flex items-start gap-3">
            <span
              className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg ${typeColorMap[type]}`}
            >
              {iconMap[type] || <MdInfoOutline />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="font-semibold text-base truncate">{title}</h3>
                  {!isRead && (
                    <span className="shrink-0 inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  )}
                </div>
                <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">
                  {formatDate(createdAt)}
                </span>
              </div>

              {!isExpanded && (
                <div className="mt-2 text-sm text-gray-400 line-clamp-2">
                  {Array.isArray(details) && details.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {details.slice(0, 2).map((d, i) => (
                        <span key={i} className="inline-flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-md text-xs">
                          <span className="capitalize text-gray-500">{d.field}:</span>
                          <span className="text-gray-300">{d.newValue ?? "N/A"}</span>
                        </span>
                      ))}
                      {details.length > 2 && (
                        <span className="text-xs text-gray-500">+{details.length - 2} more</span>
                      )}
                    </div>
                  ) : (
                    <p className="truncate">{message}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pl-3">
          {!isRead && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                await markSingleRead(_id);
              }}
              disabled={!!markingSingle[_id]}
              className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Mark as read"
              title="Mark as read"
            >
              {markingSingle[_id] ? (
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              ) : (
                <MdOutlineMarkEmailRead className="w-4 h-4" />
              )}
            </button>
          )}
          {onDelete && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                await onDelete(_id);
              }}
              disabled={isDeleting}
              className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Delete notification"
              title="Delete"
            >
              {isDeleting ? (
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
              ) : (
                <MdDeleteOutline className="w-4 h-4" />
              )}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(_id);
            }}
            className={`p-2 rounded-lg transition-all duration-200 ${
              isExpanded 
                ? "bg-white/10 text-white" 
                : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
            }`}
            aria-label={isExpanded ? "Collapse" : "Expand"}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <MdExpandLess className="w-5 h-5" /> : <MdExpandMore className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-white/5 pt-4 bg-slate-900/50">
          <div className="text-sm leading-relaxed text-gray-300">{renderDetailsOrMessage()}</div>

          {/* Metadata tags */}
          <div className="mt-4 flex flex-wrap gap-2">
            {resource && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-xs">
                <span className="text-gray-500">Resource:</span>
                <span className="text-white font-medium">{resource}</span>
              </span>
            )}
            {createdBy && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-xs">
                <span className="text-gray-500">By:</span>
                <span className="text-white font-medium">{createdBy}</span>
              </span>
            )}
            {action && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-xs">
                <span className="text-gray-500">Action:</span>
                <span className="text-cyan-400 font-medium">{action}</span>
              </span>
            )}
          </div>

          {/* Copy button */}
          <div className="mt-4">
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await navigator.clipboard.writeText(message || "");
                } catch (e) {
                  console.error("copy failed", e);
                }
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 text-xs text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Copy full message"
            >
              <MdContentCopy className="w-3.5 h-3.5" />
              Copy Message
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
