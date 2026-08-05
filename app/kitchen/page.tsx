// app/kitchen/page.tsx
// Standalone kitchen display — just the ticket board, full-screen, optionally
// filtered to one kitchen station. See docs/handover/PHASE-13-SELL-READY-GAPS.md
// part 2: this reuses the existing OrderManagerGrid (already delivery-aware)
// instead of building a new board, and reuses normal session auth rather than
// inventing a device-PIN/token scheme (deliberate v1 choice, not a default).

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChefHat, RefreshCw, Wifi, WifiOff, Radio, Maximize, Minimize } from 'lucide-react';
import { OrderManagerGrid } from '@/pos_modules/orders';
import type { Order } from '@/types/order.types';
import { useRealtimeSync } from '@/lib/hooks/useRealtimeSync';
import { useFullscreen } from '@/lib/hooks/useFullscreen';
import RequirePermission from '@/components/auth/RequirePermission';
import type { RealtimeEvent } from '@/lib/realtime/types';

const FETCH_TIMEOUT_MS = 15_000;
const REFRESH_INTERVAL = 30_000;
const ALL_STATIONS = 'all';

interface MenuItemLite {
  _id: string;
  kitchenStation?: string;
}

export default function KitchenScreenPage() {
  return (
    <RequirePermission permission="view_kitchen">
      <KitchenScreen />
    </RequirePermission>
  );
}

function KitchenScreen() {
  const { isFullscreen, supported, toggle: toggleFullscreen } = useFullscreen();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [stationMap, setStationMap] = useState<Map<string, string>>(new Map());
  const [selectedStation, setSelectedStation] = useState<string>(ALL_STATIONS);

  const abortRef = useRef<AbortController | null>(null);

  const fetchOrders = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch('/api/orders?activeOnly=true', {
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
      });
      if (!res.ok) throw new Error(`Orders fetch failed (${res.status})`);
      const data = await res.json();
      setOrders(data.orders);
    } catch (error: unknown) {
      if ((error as Error).name === 'AbortError') return;
      console.error('[Kitchen] Failed to fetch orders:', error);
    } finally {
      setIsLoadingOrders(false);
    }
  }, []);

  // Menu items, fetched once, purely to build an itemId → kitchenStation
  // lookup. Order items don't carry their own station (only name/price), so
  // this stays a client-side join rather than a schema change.
  const fetchStationMap = useCallback(async () => {
    try {
      const res = await fetch('/api/menu/items?all=true', {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Menu items fetch failed (${res.status})`);
      const data = await res.json();
      const items: MenuItemLite[] = data.items || [];
      setStationMap(new Map(items.map((i) => [i._id, i.kitchenStation || ''])));
    } catch (error) {
      console.error('[Kitchen] Failed to fetch menu items for station map:', error);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchStationMap();
  }, [fetchOrders, fetchStationMap]);

  const handleRealtimeEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.type.startsWith('order:') || event.entityId === '__poll__') {
        fetchOrders();
      } else if (event.type.startsWith('menu:')) {
        fetchStationMap();
      }
    },
    [fetchOrders, fetchStationMap],
  );

  const { status: realtimeStatus } = useRealtimeSync({
    pollingInterval: REFRESH_INTERVAL,
    onEvent: handleRealtimeEvent,
  });

  const stations = useMemo(() => {
    const set = new Set<string>();
    stationMap.forEach((station) => { if (station) set.add(station); });
    return Array.from(set).sort();
  }, [stationMap]);

  const filteredOrders = useMemo(() => {
    if (selectedStation === ALL_STATIONS) return orders;
    return orders.filter((order) =>
      order.items.some((item) => stationMap.get(item.itemId) === selectedStation),
    );
  }, [orders, selectedStation, stationMap]);

  const handleStatusChange = useCallback(async (orderId: string, action: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Order update failed (${res.status})`);
      const updatedOrder: Order = await res.json();
      setOrders((prev) =>
        prev
          .map((o) => (o._id === orderId ? updatedOrder : o))
          .filter((o) => !['completed', 'cancelled'].includes(o.status)),
      );
    } catch (error) {
      console.error('[Kitchen] Failed to update order:', error);
      // Reconcile with the server rather than leaving a stale card on screen
      fetchOrders();
    }
  }, [fetchOrders]);

  const syncMeta = {
    connected: { icon: Wifi, color: 'text-emerald-400', label: 'Live' },
    connecting: { icon: Radio, color: 'text-amber-400', label: 'Connecting…' },
    polling: { icon: Radio, color: 'text-yellow-400', label: 'Polling' },
    disconnected: { icon: WifiOff, color: 'text-red-400', label: 'Offline' },
  }[realtimeStatus];
  const SyncIcon = syncMeta.icon;

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <ChefHat size={20} className="text-cyan-400" />
          <h1 className="text-lg font-semibold text-white">Kitchen Display</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Station filter */}
          <select
            value={selectedStation}
            onChange={(e) => setSelectedStation(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value={ALL_STATIONS}>All Stations</option>
            {stations.map((station) => (
              <option key={station} value={station}>{station}</option>
            ))}
          </select>

          <div className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-gray-800 ${syncMeta.color}`}>
            <SyncIcon size={14} />
            <span className="hidden sm:inline text-xs font-medium">{syncMeta.label}</span>
          </div>

          <button
            onClick={fetchOrders}
            className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>

          {/* Full screen. The point of this screen is tickets read from across
              a pass, so the browser chrome is worth reclaiming. Hidden entirely
              where the API is unavailable rather than shown and doing nothing. */}
          {supported && (
            <button
              onClick={() => void toggleFullscreen()}
              className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
              aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {/* surface="kds": the card body is inert here and the ladder stops at
            Served / Out — the kitchen hands food over, the till closes and
            settles the bill. See pos_modules/orders/statusLadder.ts.
            No onViewDetails: there is no panel on this screen, and a sliding
            panel over a ticket board is obstruction. The KDS card shows every
            line, modifier and note instead. */}
        <OrderManagerGrid
          orders={filteredOrders}
          onStatusChange={handleStatusChange}
          isLoading={isLoadingOrders}
          surface="kds"
        />
      </main>
    </div>
  );
}
