// pos_modules/orders/printing-facility/ThermalPrinterStatus.tsx
// UI component to show the connection status of the thermal print service
// Displays real-time printer status and provides quick actions

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Printer,
  PrinterCheck,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  Wifi,
  WifiOff,
  Check,
  X,
} from 'lucide-react';
import { usePrintService } from './ThermalPrintService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PrinterInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  isOnline: boolean;
  totalJobsPrinted: number;
}

interface ThermalPrinterStatusProps {
  /** Show expanded details by default */
  defaultExpanded?: boolean;
  /** Compact mode - just show icon */
  compact?: boolean;
  /** Show test print button */
  showTestButton?: boolean;
  /** Callback when status changes */
  onStatusChange?: (connected: boolean) => void;
  /** Custom class name */
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ThermalPrinterStatus({
  defaultExpanded = false,
  compact = false,
  showTestButton = true,
  onStatusChange,
  className = '',
}: ThermalPrinterStatusProps) {
  const {
    isConnected,
    isInitialized,
    isPrinting,
    error,
    checkConnection,
    testPrinter,
    getPrinters,
    clearError,
  } = usePrintService();

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch printers when connected
  useEffect(() => {
    if (isConnected && expanded) {
      getPrinters().then((data) => {
        // Handle different response shapes from the API
        const printerList = Array.isArray(data) 
          ? data 
          : (data as any)?.printers ?? [];
        setPrinters(printerList as PrinterInfo[]);
      }).catch(() => {
        setPrinters([]);
      });
    }
  }, [isConnected, expanded, getPrinters]);

  // Notify parent of status changes
  useEffect(() => {
    onStatusChange?.(isConnected);
  }, [isConnected, onStatusChange]);

  // Handle connection check
  const handleCheckConnection = useCallback(async () => {
    setIsChecking(true);
    try {
      await checkConnection();
    } finally {
      setIsChecking(false);
    }
  }, [checkConnection]);

  // Handle test print
  const handleTestPrint = useCallback(async (printerId?: string) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testPrinter(printerId);
      setTestResult({
        success: result.success,
        message: result.success ? 'Test print sent!' : (result.error || 'Print failed'),
      });
      // Clear result after 3 seconds
      setTimeout(() => setTestResult(null), 3000);
    } finally {
      setIsTesting(false);
    }
  }, [testPrinter]);

  // Status color based on connection state
  const statusColor = isConnected
    ? 'text-emerald-400'
    : isInitialized
      ? 'text-red-400'
      : 'text-yellow-400';

  const statusBgColor = isConnected
    ? 'bg-emerald-500/10 border-emerald-500/20'
    : isInitialized
      ? 'bg-red-500/10 border-red-500/20'
      : 'bg-yellow-500/10 border-yellow-500/20';

  const statusLabel = isConnected
    ? 'Online'
    : isInitialized
      ? 'Offline'
      : 'Connecting...';

  // Compact mode - just show an icon button
  if (compact) {
    return (
      <button
        onClick={handleCheckConnection}
        disabled={isChecking}
        className={`relative p-2 rounded-lg transition-colors ${statusBgColor} ${statusColor} ${className}`}
        title={`Printer ${statusLabel}${error ? ` - ${error}` : ''}`}
      >
        {isConnected ? (
          <PrinterCheck size={16} />
        ) : (
          <Printer size={16} />
        )}
        {isPrinting && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
        )}
        {error && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
        )}
      </button>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Main Status Button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors border ${statusBgColor}`}
      >
        <div className="relative">
          {isConnected ? (
            <PrinterCheck size={16} className={statusColor} />
          ) : (
            <Printer size={16} className={statusColor} />
          )}
          {isPrinting && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          )}
        </div>
        <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
        <ChevronDown
          size={12}
          className={`text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expanded Dropdown */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 z-50 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800 bg-gray-800/50">
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <Wifi size={14} className="text-emerald-400" />
                ) : (
                  <WifiOff size={14} className="text-red-400" />
                )}
                <span className="text-sm font-semibold text-gray-200">
                  XP Thermal Service
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCheckConnection}
                  disabled={isChecking}
                  className="p-1.5 rounded-md hover:bg-gray-700 transition-colors"
                  title="Refresh connection"
                >
                  <RefreshCw
                    size={12}
                    className={`text-gray-400 ${isChecking ? 'animate-spin' : ''}`}
                  />
                </button>
                <button
                  onClick={() => setExpanded(false)}
                  className="p-1.5 rounded-md hover:bg-gray-700 transition-colors"
                >
                  <X size={12} className="text-gray-400" />
                </button>
              </div>
            </div>

            {/* Connection Status */}
            <div className="px-3 py-2 border-b border-gray-800/50">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Service Status</span>
                <span className={`text-xs font-medium ${statusColor}`}>
                  {isConnected ? '● Connected' : isInitialized ? '○ Disconnected' : '◌ Initializing'}
                </span>
              </div>
              {error && (
                <div className="mt-1.5 flex items-start gap-1.5 text-xs text-red-400">
                  <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                  <span className="flex-1">{error}</span>
                  <button
                    onClick={clearError}
                    className="text-red-500 hover:text-red-400"
                  >
                    <X size={10} />
                  </button>
                </div>
              )}
            </div>

            {/* Printers List */}
            {isConnected && (
              <div className="max-h-48 overflow-y-auto">
                {printers.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-gray-500">
                    No printers configured
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-800/50">
                    {printers.map((printer) => (
                      <li key={printer.id} className="px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                printer.isOnline ? 'bg-emerald-400' : 'bg-gray-500'
                              }`}
                            />
                            <div>
                              <p className="text-xs font-medium text-gray-200">
                                {printer.name}
                              </p>
                              <p className="text-[10px] text-gray-500">
                                {printer.type} • {printer.totalJobsPrinted} jobs
                              </p>
                            </div>
                          </div>
                          {showTestButton && (
                            <button
                              onClick={() => handleTestPrint(printer.id)}
                              disabled={isTesting || !printer.isOnline}
                              className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                                printer.isOnline
                                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                              }`}
                            >
                              {isTesting ? '...' : 'Test'}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Test Result Toast */}
            <AnimatePresence>
              {testResult && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className={`mx-2 mb-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
                    testResult.success
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {testResult.success ? <Check size={12} /> : <AlertCircle size={12} />}
                  {testResult.message}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer Actions */}
            {!isConnected && (
              <div className="px-3 py-2.5 bg-gray-800/30 border-t border-gray-800">
                <p className="text-[10px] text-gray-500 mb-2">
                  Make sure xp-thermal-service is running on port 9100
                </p>
                <button
                  onClick={handleCheckConnection}
                  disabled={isChecking}
                  className="w-full py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white rounded-lg transition-colors"
                >
                  {isChecking ? 'Checking...' : 'Retry Connection'}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact Export for Toolbar Use
// ─────────────────────────────────────────────────────────────────────────────

export function ThermalPrinterStatusCompact(props: Omit<ThermalPrinterStatusProps, 'compact'>) {
  return <ThermalPrinterStatus {...props} compact />;
}
