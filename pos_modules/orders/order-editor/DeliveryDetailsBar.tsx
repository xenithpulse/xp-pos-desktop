// pos_modules/orders/order-editor/DeliveryDetailsBar.tsx
// Delivery-only bar: delivery fee + rider name ("assigned to" — a single free-text
// field, deliberately not a dispatch/GPS system, see docs/handover/PHASE-13-SELL-READY-GAPS.md).
// Both fields save on blur via PUT /api/orders/:id, same pattern as
// TakeawayClientPanel.handleUpdateField.

'use client';

import { useEffect, useState } from 'react';
import { Truck, Bike } from 'lucide-react';
import type { Order } from '@/types/order.types';

export interface DeliveryDetailsBarProps {
  activeOrder: Order | null;
  /** Called after a successful save so the parent can pull the fresh order. */
  onSaved: () => void;
  disabled?: boolean;
}

export default function DeliveryDetailsBar({ activeOrder, onSaved, disabled }: DeliveryDetailsBarProps) {
  const [fee, setFee] = useState('');
  const [rider, setRider] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Sync local inputs when the active order changes (switching orders, refresh)
  useEffect(() => {
    setFee(activeOrder?.deliveryFee ? String(activeOrder.deliveryFee) : '');
    setRider(activeOrder?.riderName || '');
  }, [activeOrder?._id, activeOrder?.deliveryFee, activeOrder?.riderName]);

  if (!activeOrder) return null;

  const save = async (patch: Record<string, unknown>) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/orders/${activeOrder._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) onSaved();
    } catch {
      // User can retry — input keeps their typed value either way
    } finally {
      setIsSaving(false);
    }
  };

  const inputCls =
    'w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 disabled:opacity-50';

  return (
    <div className="px-3 py-2 border-b border-gray-800 flex gap-2">
      <div className="flex-1 relative">
        <Truck size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="number"
          min={0}
          step="0.01"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          onBlur={() => save({ deliveryFee: fee === '' ? 0 : parseFloat(fee) || 0 })}
          placeholder="Delivery fee"
          disabled={disabled || isSaving}
          className={inputCls}
        />
      </div>
      <div className="flex-1 relative">
        <Bike size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={rider}
          onChange={(e) => setRider(e.target.value)}
          onBlur={() => save({ riderName: rider.trim() })}
          placeholder="Rider name (optional)"
          disabled={disabled || isSaving}
          className={inputCls}
        />
      </div>
    </div>
  );
}
