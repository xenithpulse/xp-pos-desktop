// components/admin/tabs/settings/OperationalSection.tsx
// Default order mode + operational toggles.

'use client';

import { Field, selectCls, checkboxCls, SectionHeading, type SectionProps } from './shared';

export default function OperationalSection({ settings, update }: SectionProps) {
  return (
    <div className="space-y-5">
      <SectionHeading title="Operational" subtitle="Defaults for how orders start and flow." />

      <div className="grid grid-cols-2 gap-4">
        <Field label="Default Order Mode">
          <select className={selectCls} value={settings.defaultOrderMode} onChange={(e) => update('defaultOrderMode', e.target.value)}>
            <option value="dine_in">Dine-In</option>
            <option value="takeaway">Takeaway</option>
            <option value="delivery">Delivery</option>
            <option value="drive_thru">Drive-Thru</option>
            <option value="curbside">Curbside</option>
          </select>
        </Field>
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
          <input type="checkbox" className={checkboxCls} checked={settings.autoConfirmOrders} onChange={(e) => update('autoConfirmOrders', e.target.checked)} />
          Auto-confirm new orders
        </label>
        <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
          <input type="checkbox" className={checkboxCls} checked={settings.kitchenDisplayEnabled} onChange={(e) => update('kitchenDisplayEnabled', e.target.checked)} />
          Enable kitchen display system (KDS)
        </label>
      </div>
    </div>
  );
}
