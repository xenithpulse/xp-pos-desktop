// components/admin/tabs/settings/BusinessSection.tsx
// Business identity + address (with real country picker) + logo upload.

'use client';

import { useState } from 'react';
import { Upload, Trash2, Loader2, ImageIcon } from 'lucide-react';
import { COUNTRIES } from '@/lib/countries';
import { Field, inputCls, selectCls, SectionHeading, type SectionProps } from './shared';

const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MAX_BYTES = 5 * 1024 * 1024;

export default function BusinessSection({ settings, update }: SectionProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleLogoUpload = async (file: File) => {
    setUploadError(null);
    if (!ALLOWED.includes(file.type)) {
      setUploadError('Use PNG, JPG, WebP, GIF or AVIF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError('Image must be 5MB or smaller.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      const url = data.links?.[0];
      if (url) update('logoUrl', url);
    } catch (e) {
      setUploadError((e as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeading title="Business Identity" subtitle="Name, contact, address and logo — printed on receipts." />

      {/* Logo */}
      <div>
        <span className="text-xs font-medium text-[#888] uppercase tracking-wider">Logo</span>
        <div className="mt-2 flex items-center gap-4">
          <div className="w-20 h-20 rounded-lg border border-white/[0.08] bg-[#111] flex items-center justify-center overflow-hidden shrink-0">
            {settings.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <ImageIcon size={24} className="text-[#444]" />
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 px-3 py-2 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-lg text-sm cursor-pointer transition-colors">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                <span>{settings.logoUrl ? 'Replace' : 'Upload'} logo</span>
                <input
                  type="file"
                  accept={ALLOWED.join(',')}
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ''; }}
                />
              </label>
              {settings.logoUrl && (
                <button
                  onClick={() => update('logoUrl', '')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg text-sm transition-colors"
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </div>
            <p className="text-[11px] text-[#555]">PNG/JPG/WebP, up to 5MB. Printed in black &amp; white on the receipt.</p>
            {uploadError && <p className="text-[11px] text-red-400">{uploadError}</p>}
          </div>
        </div>
      </div>

      {/* Identity */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Business Name">
          <input className={inputCls} value={settings.businessName} onChange={(e) => update('businessName', e.target.value)} placeholder="Restaurant Name" />
        </Field>
        <Field label="Short Name">
          <input className={inputCls} value={settings.businessNameShort || ''} onChange={(e) => update('businessNameShort', e.target.value)} placeholder="Short" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Phone">
          <input className={inputCls} value={settings.phone || ''} onChange={(e) => update('phone', e.target.value)} placeholder="+1 555 1234" />
        </Field>
        <Field label="Email">
          <input className={inputCls} value={settings.email || ''} onChange={(e) => update('email', e.target.value)} placeholder="info@restaurant.com" />
        </Field>
        <Field label="Website">
          <input className={inputCls} value={settings.website || ''} onChange={(e) => update('website', e.target.value)} placeholder="https://..." />
        </Field>
      </div>

      {/* Address */}
      <div className="pt-2 border-t border-white/[0.06] space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Address Line 1">
            <input className={inputCls} value={settings.businessAddress.line1} onChange={(e) => update('businessAddress.line1', e.target.value)} />
          </Field>
          <Field label="Address Line 2">
            <input className={inputCls} value={settings.businessAddress.line2 || ''} onChange={(e) => update('businessAddress.line2', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <Field label="City">
            <input className={inputCls} value={settings.businessAddress.city} onChange={(e) => update('businessAddress.city', e.target.value)} />
          </Field>
          <Field label="State / Province">
            <input className={inputCls} value={settings.businessAddress.state || ''} onChange={(e) => update('businessAddress.state', e.target.value)} />
          </Field>
          <Field label="Postal Code">
            <input className={inputCls} value={settings.businessAddress.postalCode || ''} onChange={(e) => update('businessAddress.postalCode', e.target.value)} />
          </Field>
          <Field label="Country">
            <select className={selectCls} value={settings.businessAddress.country} onChange={(e) => update('businessAddress.country', e.target.value)}>
              {/* Preserve any legacy free-text country not in the list */}
              {settings.businessAddress.country && !COUNTRIES.some((c) => c.name === settings.businessAddress.country) && (
                <option value={settings.businessAddress.country}>{settings.businessAddress.country}</option>
              )}
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.name}>{c.name}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>
    </div>
  );
}
