// pos_modules/orders/printing-facility/DaySummaryPanel.tsx
// Day Summary Report Panel - Generates and prints daily sales reports via thermal print service
// Shows report preview and allows printing X-Report, Z-Report, or custom reports

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Printer,
  RefreshCw,
  CalendarDays,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  CreditCard,
  AlertCircle,
  Check,
  FileText,
  Clock,
  Users,
} from 'lucide-react';
import { usePrintService } from './ThermalPrintService';
import { createDaySummaryData, type CreateDaySummaryOptions } from './helpers';
import type { DaySummaryData } from './types';
import type { Order, OrderStats } from '@/types/order.types';
import type { ISettings } from '@/types/settings.types';
import { formatPrice } from '@/types/menu.types';
import { usePOSStore } from '@/stores/posStore';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DaySummaryPanelProps {
  /** Whether the panel is visible */
  isOpen: boolean;
  /** Called when panel should close */
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function DaySummaryPanel({ isOpen, onClose }: DaySummaryPanelProps) {
  const settings = usePOSStore((s) => s.settings);
  
  const {
    printDaySummary,
    isConnected,
    isPrinting,
    error: printError,
    clearError,
  } = usePrintService();

  const [reportType, setReportType] = useState<'x_report' | 'z_report' | 'day_summary'>('day_summary');
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch today's orders and stats
  const fetchDayData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfDay = today.toISOString();
      const endOfDay = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();

      // Fetch all orders for today
      const ordersRes = await fetch(
        `/api/orders?startDate=${startOfDay}&endDate=${endOfDay}&limit=1000`
      );
      if (!ordersRes.ok) throw new Error('Failed to fetch orders');
      const ordersData = await ordersRes.json();

      // Fetch stats
      const statsRes = await fetch('/api/orders/stats');
      if (!statsRes.ok) throw new Error('Failed to fetch stats');
      const statsData = await statsRes.json();

      setOrders(ordersData.orders || []);
      setStats(statsData);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch data when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchDayData();
    }
  }, [isOpen, fetchDayData]);

  // Generate summary data
  const summaryData = useMemo<DaySummaryData | null>(() => {
    if (!settings || orders.length === 0) return null;

    // Cast settings to ISettings (it should be compatible)
    return createDaySummaryData(orders, stats, settings as ISettings, {
      reportType,
      generatedBy: 'System',
      includeHourlyBreakdown: true,
      includeTopItems: true,
      topItemsCount: 5,
    });
  }, [orders, stats, settings, reportType]);

  // Handle print
  const handlePrint = useCallback(async () => {
    if (!summaryData) return;

    setPrintSuccess(false);
    clearError();

    const result = await printDaySummary(summaryData, {
      printerId: 'report', // Use default report printer
    });

    if (result.success) {
      setPrintSuccess(true);
      setTimeout(() => setPrintSuccess(false), 3000);
    }
  }, [summaryData, printDaySummary, clearError]);

  // Computed values from summary
  const completedOrders = useMemo(() => 
    orders.filter(o => o.status === 'completed' && !o.isVoid),
    [orders]
  );

  const grossRevenue = useMemo(() =>
    completedOrders.reduce((sum, o) => sum + o.grandTotal, 0),
    [completedOrders]
  );

  const totalDiscounts = useMemo(() =>
    completedOrders.reduce((sum, o) => sum + (o.discountAmount || 0), 0),
    [completedOrders]
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-gray-800/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <FileText size={20} className="text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Day Summary Report</h2>
                <p className="text-xs text-gray-400">
                  {new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <X size={18} className="text-gray-400" />
            </button>
          </div>

          {/* Report Type Selector */}
          <div className="flex gap-2 px-5 py-3 border-b border-gray-800">
            {[
              { value: 'day_summary', label: 'Day Summary' },
              { value: 'x_report', label: 'X Report' },
              { value: 'z_report', label: 'Z Report' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setReportType(option.value as typeof reportType)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  reportType === option.value
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={fetchDayData}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {/* Content */}
          <div className="p-5 max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw size={24} className="text-purple-400 animate-spin" />
              </div>
            ) : fetchError ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle size={32} className="text-red-400 mb-3" />
                <p className="text-red-400">{fetchError}</p>
                <button
                  onClick={fetchDayData}
                  className="mt-3 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Overview Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard
                    icon={<ShoppingBag size={16} />}
                    label="Total Orders"
                    value={orders.length}
                    color="purple"
                  />
                  <StatCard
                    icon={<Check size={16} />}
                    label="Completed"
                    value={completedOrders.length}
                    color="green"
                  />
                  <StatCard
                    icon={<DollarSign size={16} />}
                    label="Gross Revenue"
                    value={formatPrice(grossRevenue)}
                    color="blue"
                  />
                  <StatCard
                    icon={<TrendingUp size={16} />}
                    label="Net Revenue"
                    value={formatPrice(grossRevenue - totalDiscounts)}
                    color="emerald"
                  />
                </div>

                {/* Payment Breakdown */}
                {summaryData?.paymentBreakdown && summaryData.paymentBreakdown.length > 0 && (
                  <div className="bg-gray-800/50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                      <CreditCard size={14} className="text-blue-400" />
                      Payment Breakdown
                    </h3>
                    <div className="space-y-2">
                      {summaryData.paymentBreakdown.map((payment) => (
                        <div
                          key={payment.method}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-gray-400">{payment.method}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-gray-500">{payment.count} txns</span>
                            <span className="text-white font-medium">
                              {formatPrice(payment.amount)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Order Mode Breakdown */}
                {summaryData?.orderModeBreakdown && summaryData.orderModeBreakdown.length > 0 && (
                  <div className="bg-gray-800/50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                      <Users size={14} className="text-purple-400" />
                      Order Types
                    </h3>
                    <div className="space-y-2">
                      {summaryData.orderModeBreakdown.map((mode) => (
                        <div
                          key={mode.mode}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-gray-400">{mode.mode}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-gray-500">{mode.count} orders</span>
                            <span className="text-white font-medium">
                              {formatPrice(mode.revenue)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Selling Items */}
                {summaryData?.topSellingItems && summaryData.topSellingItems.length > 0 && (
                  <div className="bg-gray-800/50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                      <TrendingUp size={14} className="text-amber-400" />
                      Top Selling Items
                    </h3>
                    <div className="space-y-2">
                      {summaryData.topSellingItems.map((item, idx) => (
                        <div
                          key={item.name}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-gray-400">
                            <span className="text-gray-600 mr-2">{idx + 1}.</span>
                            {item.name}
                          </span>
                          <div className="flex items-center gap-4">
                            <span className="text-gray-500">{item.quantity} sold</span>
                            <span className="text-white font-medium">
                              {formatPrice(item.revenue)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hourly Breakdown (collapsed by default) */}
                {summaryData?.hourlyBreakdown && summaryData.hourlyBreakdown.length > 0 && (
                  <details className="bg-gray-800/50 rounded-xl overflow-hidden">
                    <summary className="p-4 cursor-pointer text-sm font-semibold text-gray-300 flex items-center gap-2">
                      <Clock size={14} className="text-cyan-400" />
                      Hourly Breakdown
                    </summary>
                    <div className="px-4 pb-4 space-y-2">
                      {summaryData.hourlyBreakdown.map((hour) => (
                        <div
                          key={hour.hour}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-gray-400">{hour.hour}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-gray-500">{hour.orders} orders</span>
                            <span className="text-white font-medium">
                              {formatPrice(hour.revenue)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-800 bg-gray-800/30">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-emerald-400' : 'bg-red-400'
                }`}
              />
              <span className="text-gray-400">
                {isConnected ? 'Printer Online' : 'Printer Offline'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {printError && (
                <span className="text-xs text-red-400">{printError}</span>
              )}
              {printSuccess && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <Check size={12} />
                  Sent to printer
                </span>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Close
              </button>
              <button
                onClick={handlePrint}
                disabled={!summaryData || isPrinting || !isConnected}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  !summaryData || isPrinting || !isConnected
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-600 text-white hover:bg-purple-500'
                }`}
              >
                <Printer size={16} />
                {isPrinting ? 'Printing...' : 'Print Report'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat Card Component
// ─────────────────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: 'purple' | 'green' | 'blue' | 'emerald' | 'amber';
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  const colors = {
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };

  return (
    <div className={`p-3 rounded-xl border ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
