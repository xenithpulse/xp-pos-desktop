// pos_modules/orders/helpers.ts
// Shared helper functions for order components

import React from 'react';
import {
  Clock,
  UtensilsCrossed,
  Package,
  Truck,
  Car,
  MapPin,
} from 'lucide-react';

/**
 * Formats elapsed time since an ISO date string.
 * Returns e.g. "Just now", "5m", "2h 15m"
 */
export function formatElapsedTime(createdAt: string): string {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Formats elapsed time with "ago" suffix (for list views).
 */
export function formatElapsedTimeAgo(createdAt: string): string {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}h ${mins}m ago`;
}

/**
 * Formats a date string to time only (e.g. "02:30 PM").
 */
export function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Formats a date string to date+time (e.g. "Mar 3, 02:30 PM").
 */
export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Returns a lucide icon for a given order mode.
 */
export function getModeIcon(mode: string, size = 14): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    dine_in: React.createElement(UtensilsCrossed, { size }),
    takeaway: React.createElement(Package, { size }),
    delivery: React.createElement(Truck, { size }),
    drive_thru: React.createElement(Car, { size }),
    curbside: React.createElement(MapPin, { size }),
  };
  return icons[mode] || React.createElement(Clock, { size });
}

/**
 * Opens a popup print window with thermal-receipt-formatted HTML.
 */
export function openPrintWindow(contentHTML: string) {
  const printWindow = window.open('', '_blank', 'width=300,height=600');
  if (!printWindow) return;

  const html = `<!DOCTYPE html><html><head><style>
    @page{margin:0;size:80mm auto}
    @media print{html,body{width:80mm;margin:0;padding:0}}
    body{font-family:'Courier New',monospace;font-size:12px;line-height:1.4;margin:0;padding:8px;width:80mm;color:#000}
    .center{text-align:center}
    .right{text-align:right}
    .bold{font-weight:bold}
    .large{font-size:16px}
    .small{font-size:10px}
    .divider{border-top:1px dashed #000;margin:8px 0}
    .divider.thick{border-top:2px solid #000;margin:10px 0}
    .item-row{display:flex;justify-content:space-between;align-items:flex-start;margin:2px 0}
    .item-name{flex:1;padding-right:4px}
    .item-qty{width:24px;text-align:left}
    .item-num{width:18px;text-align:left;color:#666}
    .item-price{text-align:right;min-width:60px;font-weight:500}
    .modifier{padding-left:30px;font-size:10px;color:#333}
    .section-title{font-weight:bold;font-size:11px;margin:4px 0;letter-spacing:0.5px}
    .info-table{width:100%;font-size:11px;border-collapse:collapse}
    .info-table td{padding:1px 0}
    .info-table td:first-child{color:#444}
    .info-table td:last-child{text-align:right}
    .grand-total{font-size:16px;font-weight:bold;padding:6px 0;background:#f5f5f5;margin:4px -8px;padding-left:8px;padding-right:8px}
    .grand-total span:last-child{font-size:18px}
    .paid-badge{font-weight:bold;font-size:14px;margin:8px 0;letter-spacing:1px}
    .amount-due{color:#c00;font-size:14px}
    .discount{color:#080}
    .footer-text{font-size:12px;font-weight:500;margin-top:8px}
  </style></head><body>${contentHTML}<script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);};<\/script></body></html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}
