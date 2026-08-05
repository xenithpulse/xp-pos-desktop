// components/admin/tabs/settings/HubSection.tsx
// POS management workspace behaviour: seating flow, visible tabs, automation.

'use client';

import { Users, LayoutGrid, ClipboardList, ShoppingBag, History, Printer, CalendarClock, Truck } from 'lucide-react';
import { Field, inputCls, selectCls, checkboxCls, SectionHeading, type SectionProps } from './shared';

export default function HubSection({ settings, update }: SectionProps) {
  return (
    <div className="space-y-6">
      <SectionHeading title="Dine-In Configuration" subtitle="Behaviour and visible modules of the dine-in workspace." />

      {/* Seating Flow */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-[#888] uppercase tracking-wider flex items-center gap-1.5"><Users size={12} /> Seating Flow</h4>
        <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
          <input type="checkbox" className={checkboxCls} checked={settings.hub.showTableSessionPanel} onChange={(e) => update('hub.showTableSessionPanel', e.target.checked)} />
          Show session panel on table click
          <span className="text-xs text-[#555]">(off = go straight to Order Editor)</span>
        </label>
        <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
          <input type="checkbox" className={checkboxCls} checked={settings.hub.requireCoversOnSeat} onChange={(e) => update('hub.requireCoversOnSeat', e.target.checked)} />
          Require guest count before seating
        </label>
        <div className="flex items-center gap-3 pl-6">
          <Field label="Default Covers">
            <input className={inputCls + ' w-24'} type="number" min={1} max={100} value={settings.hub.defaultCovers} onChange={(e) => update('hub.defaultCovers', Math.max(1, parseInt(e.target.value) || 1))} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
          <input type="checkbox" className={checkboxCls} checked={settings.hub.allowReservations} onChange={(e) => update('hub.allowReservations', e.target.checked)} />
          Allow table reservations
        </label>
      </div>

      {/* Reservation Timing */}
      {settings.hub.allowReservations && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-[#888] uppercase tracking-wider flex items-center gap-1.5"><CalendarClock size={12} /> Reservation Timing</h4>
          <p className="text-xs text-[#666] leading-relaxed">
            A booking does not lock its table the moment it is confirmed — only once the hold
            window opens. A 9:00 PM reservation with a 30-minute hold leaves the table sellable
            to walk-ins until 8:30 PM.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hold Before (min)">
              <input
                className={inputCls}
                type="number"
                min={0}
                max={720}
                value={settings.hub.reservationHoldMinutes}
                onChange={(e) => update('hub.reservationHoldMinutes', Math.max(0, parseInt(e.target.value) || 0))}
              />
            </Field>
            <Field label="Expected Stay (min)">
              <input
                className={inputCls}
                type="number"
                min={0}
                max={1440}
                value={settings.hub.reservationDurationMinutes}
                onChange={(e) => update('hub.reservationDurationMinutes', Math.max(0, parseInt(e.target.value) || 0))}
              />
            </Field>
            <Field label="Late Grace (min)">
              <input
                className={inputCls}
                type="number"
                min={0}
                max={240}
                value={settings.hub.reservationGraceMinutes}
                onChange={(e) => update('hub.reservationGraceMinutes', Math.max(0, parseInt(e.target.value) || 0))}
              />
            </Field>
            <Field label="Auto No-Show After (min, 0 = never)">
              <input
                className={inputCls}
                type="number"
                min={0}
                max={480}
                value={settings.hub.reservationAutoReleaseMinutes}
                onChange={(e) => update('hub.reservationAutoReleaseMinutes', Math.max(0, parseInt(e.target.value) || 0))}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
            <input type="checkbox" className={checkboxCls} checked={settings.hub.allowWalkInDuringHold} onChange={(e) => update('hub.allowWalkInDuringHold', e.target.checked)} />
            Let staff override a hold to seat a walk-in
          </label>
        </div>
      )}

      {/* Dine-In tabs */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-[#888] uppercase tracking-wider flex items-center gap-1.5"><LayoutGrid size={12} /> Dine-In Tabs</h4>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
            <input type="checkbox" className={checkboxCls} checked={settings.hub.showFloorPlan} onChange={(e) => update('hub.showFloorPlan', e.target.checked)} />
            <LayoutGrid size={14} className="text-[#555]" /> Floor Plan
          </label>
          <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
            <input type="checkbox" className={checkboxCls} checked={settings.hub.showOrders} onChange={(e) => update('hub.showOrders', e.target.checked)} />
            <ClipboardList size={14} className="text-[#555]" /> Orders
          </label>
          <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
            <input type="checkbox" className={checkboxCls} checked={settings.hub.showOrderList} onChange={(e) => update('hub.showOrderList', e.target.checked)} />
            <History size={14} className="text-[#555]" /> Order History
          </label>
        </div>
      </div>

      {/* Workspaces offered. These were tab toggles until Phase 16 §3; Takeaway
          and Delivery are their own pages now, so the setting governs whether
          the door is offered at all rather than whether a tab is drawn. */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-[#888] uppercase tracking-wider flex items-center gap-1.5"><ShoppingBag size={12} /> Workspaces Offered</h4>
        <p className="text-[11px] text-[#666]">
          Turning one off hides its link in the sidebar and on the home screen.
          Staff whose role lands them there are unaffected.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
            <input type="checkbox" className={checkboxCls} checked={settings.hub.showTakeaway} onChange={(e) => update('hub.showTakeaway', e.target.checked)} />
            <ShoppingBag size={14} className="text-[#555]" /> Takeaway
          </label>
          <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
            <input type="checkbox" className={checkboxCls} checked={settings.hub.showDelivery} onChange={(e) => update('hub.showDelivery', e.target.checked)} />
            <Truck size={14} className="text-[#555]" /> Delivery
          </label>
        </div>
      </div>

      {/* Default Tab. Takeaway and Delivery are not offered — they are pages,
          not tabs. A site that still has one stored opens on Floor Plan. */}
      <Field label="Dine-In Opens On">
        <select
          className={selectCls}
          value={
            settings.hub.defaultTab === 'takeaway' || settings.hub.defaultTab === 'delivery'
              ? 'floor-plan'
              : settings.hub.defaultTab
          }
          onChange={(e) => update('hub.defaultTab', e.target.value)}
        >
          <option value="floor-plan">Floor Plan</option>
          <option value="orders">Orders</option>
          <option value="order-editor">Order Editor</option>
          <option value="order-list">Order History</option>
        </select>
      </Field>

      {/* Automation */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-[#888] uppercase tracking-wider flex items-center gap-1.5"><Printer size={12} /> Automation</h4>
        <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
          <input type="checkbox" className={checkboxCls} checked={settings.hub.autoCloseOnPayment} onChange={(e) => update('hub.autoCloseOnPayment', e.target.checked)} />
          Auto-close session when order is fully paid
        </label>
        <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
          <input type="checkbox" className={checkboxCls} checked={settings.hub.autoPrintKOT} onChange={(e) => update('hub.autoPrintKOT', e.target.checked)} />
          Auto-print KOT when items are fired
        </label>
      </div>
    </div>
  );
}
