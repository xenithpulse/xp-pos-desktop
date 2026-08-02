// pos_modules/orders/printing-facility/PrinterSettingsPanel.tsx
// Printer Settings Panel - Configure printers via xp-thermal-service API
// Allows viewing, testing, and managing thermal printers

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Printer,
  RefreshCw,
  Check,
  AlertCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { usePrintService } from './ThermalPrintService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PrinterCapabilities {
  maxWidth: number;
  supportsBold: boolean;
  supportsUnderline: boolean;
  supportsBarcode: boolean;
  supportsQRCode: boolean;
  supportsImage: boolean;
  supportsCut: boolean;
  supportsPartialCut: boolean;
  supportsCashDrawer: boolean;
  supportsDensity: boolean;
  codepage: number;
}

interface PrinterState {
  id: string;
  status: 'online' | 'offline' | 'error' | string;
  lastSeen: number;
  consecutiveFailures: number;
  totalJobsPrinted: number;
  isConnected: boolean;
}

interface PrinterInfo {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  isDefault: boolean;
  printerName?: string;
  host?: string;
  port?: number;
  timeout: number;
  maxRetries: number;
  capabilities: PrinterCapabilities;
  state: PrinterState;
}

interface PrinterSettingsPanelProps {
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function PrinterSettingsPanel({ onClose }: PrinterSettingsPanelProps) {
  const {
    isConnected,
    isInitialized,
    getPrinters,
    testPrinter,
    checkConnection,
    getHealth,
  } = usePrintService();

  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [testingPrinterId, setTestingPrinterId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [health, setHealth] = useState<any>(null);

  // Fetch printers
  const fetchPrinters = useCallback(async () => {
    if (!isConnected) return;
    setIsLoading(true);
    try {
      const data = await getPrinters();
      // Handle different response shapes from the API
      const printerList = Array.isArray(data) 
        ? data 
        : (data as any)?.printers ?? [];
      setPrinters(printerList as PrinterInfo[]);
      const healthData = await getHealth();
      setHealth(healthData);
    } catch (err) {
      console.error('Failed to fetch printers:', err);
      setPrinters([]);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, getPrinters, getHealth]);

  useEffect(() => {
    if (isConnected) {
      fetchPrinters();
    }
  }, [isConnected, fetchPrinters]);

  // Handle test print
  const handleTestPrint = useCallback(async (printerId: string) => {
    setTestingPrinterId(printerId);
    setTestResult(null);
    try {
      const result = await testPrinter(printerId);
      setTestResult({
        id: printerId,
        success: result.success,
        message: result.success ? 'Test print sent!' : (result.error || 'Print failed'),
      });
    } finally {
      setTestingPrinterId(null);
      // Auto-clear result after 3 seconds
      setTimeout(() => setTestResult(null), 3000);
    }
  }, [testPrinter]);

  // Handle retry connection
  const handleRetryConnection = useCallback(async () => {
    setIsLoading(true);
    try {
      await checkConnection();
      if (isConnected) {
        await fetchPrinters();
      }
    } finally {
      setIsLoading(false);
    }
  }, [checkConnection, isConnected, fetchPrinters]);

  return (
    <div className="h-full flex flex-col">
      {/* Service Status */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Wifi size={16} className="text-emerald-400" />
            ) : (
              <WifiOff size={16} className="text-red-400" />
            )}
            <span className="text-sm font-medium text-gray-200">
              XP Thermal Service
            </span>
          </div>
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              isConnected
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        {health && (
          <div className="mt-2 text-xs text-gray-500">
            Uptime: {Math.floor(health.uptime / 60)} min • 
            Queue: {health.queue?.pending || 0} pending
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <WifiOff size={40} className="text-gray-600 mb-4" />
            <p className="text-gray-400 mb-2">Thermal service not connected</p>
            <p className="text-xs text-gray-600 mb-4">
              Make sure xp-thermal-service is running on port 9100
            </p>
            <button
              onClick={handleRetryConnection}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              {isLoading ? 'Connecting...' : 'Retry Connection'}
            </button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={24} className="text-purple-400 animate-spin" />
          </div>
        ) : printers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Printer size={40} className="text-gray-600 mb-4" />
            <p className="text-gray-400 mb-2">No printers configured</p>
            <p className="text-xs text-gray-600">
              Add printers via the xp-thermal-service admin interface
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-300">
                Configured Printers ({printers.length})
              </h3>
              <button
                onClick={fetchPrinters}
                className="p-1.5 text-gray-500 hover:text-white rounded transition-colors"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            {printers.map((printer) => {
              const isOnline = printer.state?.status === 'online';
              const status = printer.state?.status || 'unknown';
              const capabilities = printer.capabilities || ({} as PrinterCapabilities);
              const capTags = [
                capabilities.supportsBold && 'Bold',
                capabilities.supportsBarcode && 'Barcode',
                capabilities.supportsQRCode && 'QR',
                capabilities.supportsCut && 'Cut',
                capabilities.supportsCashDrawer && 'Drawer',
              ].filter((v): v is string => Boolean(v));

              return (
                <div
                  key={printer.id}
                  className="p-4 bg-gray-800/50 rounded-xl border border-gray-700"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          isOnline
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-gray-700 text-gray-500'
                        }`}
                      >
                        <Printer size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-white">
                            {printer.name}
                          </h4>
                          {printer.isDefault && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-semibold">
                              DEFAULT
                            </span>
                          )}
                          {!printer.enabled && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-semibold">
                              DISABLED
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {printer.type} &bull; ID: {printer.id}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5 font-mono">
                          {printer.type === 'network'
                            ? `${printer.host || ''}:${printer.port || 9100}`
                            : printer.printerName || '-'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          isOnline
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : status === 'error'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-gray-700 text-gray-500'
                        }`}
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div className="text-center p-2 rounded-lg bg-gray-800/60">
                      <p className="text-sm font-bold text-white">{printer.state?.totalJobsPrinted ?? 0}</p>
                      <p className="text-[10px] text-gray-500">Jobs Printed</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-gray-800/60">
                      <p className={`text-sm font-bold ${(printer.state?.consecutiveFailures || 0) > 0 ? 'text-red-400' : 'text-white'}`}>
                        {printer.state?.consecutiveFailures ?? 0}
                      </p>
                      <p className="text-[10px] text-gray-500">Failures</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-gray-800/60">
                      <p className="text-sm font-bold text-white">{capabilities.maxWidth || '-'}</p>
                      <p className="text-[10px] text-gray-500">Col Width</p>
                    </div>
                  </div>

                  {/* Capabilities */}
                  {capTags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {capTags.map((cap) => (
                        <span
                          key={cap}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-400"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Last seen */}
                  {printer.state?.lastSeen && (
                    <p className="mt-2 text-[10px] text-gray-600">
                      Last seen: {new Date(printer.state.lastSeen).toLocaleString()}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="mt-3 pt-3 border-t border-gray-700 flex items-center justify-between">
                    <button
                      onClick={() => handleTestPrint(printer.id)}
                      disabled={!isOnline || testingPrinterId === printer.id}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        isOnline
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                      }`}
                    >
                    {testingPrinterId === printer.id ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Printer size={12} />
                        Test Print
                      </>
                    )}
                    </button>

                    {/* Test Result */}
                    {testResult?.id === printer.id && (
                      <span
                        className={`flex items-center gap-1 text-xs ${
                          testResult.success
                            ? 'text-emerald-400'
                            : 'text-red-400'
                        }`}
                      >
                        {testResult.success ? (
                          <Check size={12} />
                        ) : (
                          <AlertCircle size={12} />
                        )}
                        {testResult.message}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-800 bg-gray-800/30">
        <p className="text-xs text-gray-500 text-center">
          Configure printers via xp-thermal-service at{' '}
          <code className="text-purple-400">http://127.0.0.1:9100</code>
        </p>
      </div>
    </div>
  );
}
