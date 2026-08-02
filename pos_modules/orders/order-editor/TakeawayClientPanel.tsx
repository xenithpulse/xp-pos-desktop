// pos_modules/orders/order-editor/TakeawayClientPanel.tsx
// Smart customer search + create/edit panel for takeaway orders.
// Flow: type name/phone → search results dropdown → select existing OR create new.
// Supports multiple addresses per customer with inline editing.

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  User, Phone, MapPin, StickyNote, ChevronDown, ChevronUp,
  Search, Plus, Check, X, Edit3, Loader2, UserPlus, MapPinned,
} from 'lucide-react';
import type { TakeawayCustomer, CustomerAddress } from '@/types/order.types';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface TakeawayClientPanelProps {
  /** Currently linked customer (null = none selected) */
  customer: TakeawayCustomer | null;
  /** Called when a customer is selected or created */
  onCustomerSelect: (customer: TakeawayCustomer) => void;
  /** Called when customer details are updated inline */
  onCustomerUpdate: (customer: TakeawayCustomer) => void;
  /** Selected address ID for this order */
  selectedAddressId?: string;
  /** Called when an address is selected */
  onAddressSelect: (addressId: string) => void;
  /** Disable interactions (e.g. while committing) */
  disabled?: boolean;
}

// Debounce delay for search
const SEARCH_DEBOUNCE_MS = 250;

export default function TakeawayClientPanel({
  customer,
  onCustomerSelect,
  onCustomerUpdate,
  selectedAddressId,
  onAddressSelect,
  disabled,
}: TakeawayClientPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TakeawayCustomer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // New customer form state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newAddressLine1, setNewAddressLine1] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newPostalCode, setNewPostalCode] = useState('');
  const [newInstructions, setNewInstructions] = useState('');

  // Address add form
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addrLabel, setAddrLabel] = useState('');
  const [addrLine1, setAddrLine1] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrPostalCode, setAddrPostalCode] = useState('');
  const [addrInstructions, setAddrInstructions] = useState('');
  const [isAddingAddress, setIsAddingAddress] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Search customers ─────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q.trim())}&limit=8`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.customers || []);
        setShowDropdown(true);
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => doSearch(value), SEARCH_DEBOUNCE_MS);
    },
    [doSearch],
  );

  // Click outside to close dropdown
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  // ── Select existing customer ─────────────────────────────────────────────
  const handleSelectCustomer = useCallback(
    (c: TakeawayCustomer) => {
      onCustomerSelect(c);
      setSearchQuery('');
      setShowDropdown(false);
      setShowNewForm(false);
      setIsEditing(false);
      // Auto-select default address
      const defaultAddr = c.addresses?.find((a) => a.isDefault) || c.addresses?.[0];
      if (defaultAddr) onAddressSelect(defaultAddr._id);
    },
    [onCustomerSelect, onAddressSelect],
  );

  // ── Create new customer ──────────────────────────────────────────────────
  const handleShowNewForm = useCallback(() => {
    setShowNewForm(true);
    setShowDropdown(false);
    // Pre-fill name/phone from search query
    if (/^\d+$/.test(searchQuery.trim())) {
      setNewPhone(searchQuery.trim());
      setNewName('');
    } else {
      setNewName(searchQuery.trim());
      setNewPhone('');
    }
    setNewEmail('');
    setNewAddressLine1('');
    setNewCity('');
    setNewPostalCode('');
    setNewInstructions('');
  }, [searchQuery]);

  const handleCreateCustomer = useCallback(async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      const body: Record<string, unknown> = {
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        email: newEmail.trim() || undefined,
      };
      if (newAddressLine1.trim()) {
        body.address = {
          label: 'Default',
          line1: newAddressLine1.trim(),
          city: newCity.trim() || undefined,
          postalCode: newPostalCode.trim() || undefined,
          instructions: newInstructions.trim() || undefined,
        };
      }
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const created: TakeawayCustomer = await res.json();
        handleSelectCustomer(created);
      }
    } catch {
      // User can retry
    } finally {
      setIsCreating(false);
    }
  }, [newName, newPhone, newEmail, newAddressLine1, newCity, newPostalCode, newInstructions, handleSelectCustomer]);

  // ── Update customer inline ───────────────────────────────────────────────
  const handleUpdateField = useCallback(
    async (field: string, value: string) => {
      if (!customer) return;
      try {
        const res = await fetch(`/api/customers/${customer._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_info', [field]: value }),
        });
        if (res.ok) {
          const updated: TakeawayCustomer = await res.json();
          onCustomerUpdate(updated);
        }
      } catch {
        // Silently fail
      }
    },
    [customer, onCustomerUpdate],
  );

  // ── Add new address ──────────────────────────────────────────────────────
  const handleAddAddress = useCallback(async () => {
    if (!customer || !addrLine1.trim()) return;
    setIsAddingAddress(true);
    try {
      const res = await fetch(`/api/customers/${customer._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_address',
          address: {
            label: addrLabel.trim() || 'Other',
            line1: addrLine1.trim(),
            city: addrCity.trim() || undefined,
            postalCode: addrPostalCode.trim() || undefined,
            instructions: addrInstructions.trim() || undefined,
            isDefault: (customer.addresses?.length ?? 0) === 0,
          },
        }),
      });
      if (res.ok) {
        const updated: TakeawayCustomer = await res.json();
        onCustomerUpdate(updated);
        setShowAddAddress(false);
        setAddrLabel('');
        setAddrLine1('');
        setAddrCity('');
        setAddrPostalCode('');
        setAddrInstructions('');
        // Select the newly added address
        const newAddr = updated.addresses?.[updated.addresses.length - 1];
        if (newAddr) onAddressSelect(newAddr._id);
      }
    } catch {
      // User can retry
    } finally {
      setIsAddingAddress(false);
    }
  }, [customer, addrLabel, addrLine1, addrCity, addrPostalCode, addrInstructions, onCustomerUpdate, onAddressSelect]);

  // ── Detach customer (start fresh search) ─────────────────────────────────
  const handleDetach = useCallback(() => {
    setSearchQuery('');
    setShowNewForm(false);
    setIsEditing(false);
    setShowAddAddress(false);
    // Parent should handle clearing customer from the TakeawayOrderSwitcher
    onCustomerSelect(null as unknown as TakeawayCustomer);
  }, [onCustomerSelect]);

  const inputCls =
    'w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500';

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="border-b border-gray-800">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-900/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <User size={14} className="text-orange-400" />
          <span className="text-sm font-semibold text-gray-300">Client</span>
          {customer && (
            <span className="text-xs text-orange-300 bg-orange-500/10 px-2 py-0.5 rounded-full truncate max-w-[140px]">
              {customer.name}
              {customer.phone ? ` · ${customer.phone}` : ''}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp size={14} className="text-gray-500" />
        ) : (
          <ChevronDown size={14} className="text-gray-500" />
        )}
      </button>

      {/* ── Expanded Body ──────────────────────────────────────────────── */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* ── Search Mode (no customer selected) ─────────────────────── */}
          {!customer && !showNewForm && (
            <div className="relative" ref={dropdownRef}>
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 z-10" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => searchQuery.trim() && doSearch(searchQuery)}
                placeholder="Search by name or phone..."
                disabled={disabled}
                className={`${inputCls} !pl-8`}
                autoFocus
              />
              {isSearching && (
                <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />
              )}

              {/* Search results dropdown */}
              {showDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-[200px] overflow-y-auto">
                  {searchResults.length === 0 && !isSearching && searchQuery.trim() && (
                    <div className="px-3 py-2 text-center">
                      <p className="text-xs text-gray-500 mb-2">No customers found</p>
                      <button
                        onClick={handleShowNewForm}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        <UserPlus size={12} />
                        Add New Customer
                      </button>
                    </div>
                  )}
                  {searchResults.map((c) => (
                    <button
                      key={c._id}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-800 transition-colors text-left"
                      onClick={() => handleSelectCustomer(c)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white truncate">{c.name}</div>
                        <div className="text-[10px] text-gray-500 truncate">
                          {c.phone || 'No phone'}
                          {c.orderCount > 0 && ` · ${c.orderCount} orders`}
                        </div>
                      </div>
                      {(c.addresses?.length ?? 0) > 0 && (
                        <MapPin size={11} className="text-gray-600 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                  {searchResults.length > 0 && searchQuery.trim() && (
                    <button
                      onClick={handleShowNewForm}
                      className="w-full flex items-center gap-2 px-3 py-2 border-t border-gray-800 hover:bg-gray-800 transition-colors text-left"
                    >
                      <Plus size={12} className="text-orange-400" />
                      <span className="text-xs text-orange-400">Add new customer</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── New Customer Form ──────────────────────────────────────── */}
          {!customer && showNewForm && (
            <div className="space-y-2 bg-gray-900/50 rounded-lg p-2.5 border border-gray-800">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
                  <UserPlus size={12} />
                  New Customer
                </span>
                <button onClick={() => setShowNewForm(false)} className="text-gray-500 hover:text-white">
                  <X size={12} />
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 relative">
                  <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Name *"
                    className={inputCls}
                    autoFocus
                  />
                </div>
                <div className="flex-1 relative">
                  <Phone size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Phone"
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="relative">
                <MapPin size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={newAddressLine1}
                  onChange={(e) => setNewAddressLine1(e.target.value)}
                  placeholder="Address (optional)"
                  className={inputCls}
                />
              </div>
              {newAddressLine1.trim() && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    placeholder="City"
                    className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                  />
                  <input
                    type="text"
                    value={newPostalCode}
                    onChange={(e) => setNewPostalCode(e.target.value)}
                    placeholder="Postal Code"
                    className="w-24 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              )}
              <div className="relative">
                <StickyNote size={13} className="absolute left-2.5 top-2 text-gray-500" />
                <textarea
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                  placeholder="Pickup notes..."
                  rows={1}
                  className={`${inputCls} resize-none`}
                />
              </div>
              <button
                onClick={handleCreateCustomer}
                disabled={!newName.trim() || isCreating}
                className="w-full flex items-center justify-center gap-1.5 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                {isCreating ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {isCreating ? 'Creating...' : 'Create & Start Order'}
              </button>
            </div>
          )}

          {/* ── Customer Selected (display + edit) ─────────────────────── */}
          {customer && (
            <div className="space-y-2">
              {/* Info row */}
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex flex-col sm:flex-row gap-1.5">
                      <input
                        type="text"
                        defaultValue={customer.name}
                        onBlur={(e) => handleUpdateField('name', e.target.value)}
                        className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:border-orange-500"
                      />
                      <input
                        type="tel"
                        defaultValue={customer.phone || ''}
                        onBlur={(e) => handleUpdateField('phone', e.target.value)}
                        placeholder="Phone"
                        className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-white">{customer.name}</span>
                      {customer.phone && <span className="text-gray-500">· {customer.phone}</span>}
                      {customer.orderCount > 0 && (
                        <span className="text-[10px] text-gray-600">({customer.orderCount} orders)</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIsEditing((p) => !p)}
                    className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-orange-400 transition-colors"
                    title="Edit customer"
                  >
                    <Edit3 size={11} />
                  </button>
                  <button
                    onClick={handleDetach}
                    className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-red-400 transition-colors"
                    title="Change customer"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>

              {/* Addresses */}
              {customer.addresses?.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider px-0.5">Addresses</div>
                  {customer.addresses?.map((addr) => (
                    <button
                      key={addr._id}
                      onClick={() => onAddressSelect(addr._id)}
                      className={`w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-md border transition-colors text-xs ${
                        selectedAddressId === addr._id
                          ? 'bg-orange-500/10 border-orange-500/40 text-white'
                          : 'bg-gray-900/30 border-gray-800 text-gray-400 hover:border-gray-700'
                      }`}
                    >
                      <MapPinned size={11} className={`flex-shrink-0 mt-0.5 ${selectedAddressId === addr._id ? 'text-orange-400' : 'text-gray-600'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{addr.line1}</div>
                        {(addr.city || addr.postalCode) && (
                          <div className="text-[10px] text-gray-500 truncate">
                            {[addr.city, addr.postalCode].filter(Boolean).join(', ')}
                          </div>
                        )}
                        {addr.label && (
                          <span className="text-[9px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                            {addr.label}
                          </span>
                        )}
                      </div>
                      {selectedAddressId === addr._id && (
                        <Check size={11} className="text-orange-400 flex-shrink-0 mt-0.5" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Add address inline */}
              {!showAddAddress ? (
                <button
                  onClick={() => setShowAddAddress(true)}
                  className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-orange-400 transition-colors px-0.5"
                >
                  <Plus size={10} />
                  <span>Add address</span>
                </button>
              ) : (
                <div className="space-y-1.5 bg-gray-900/50 rounded-md p-2 border border-gray-800">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={addrLabel}
                      onChange={(e) => setAddrLabel(e.target.value)}
                      placeholder="Label (Home, Office...)"
                      className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-[10px] focus:outline-none focus:border-orange-500"
                    />
                    <input
                      type="text"
                      value={addrLine1}
                      onChange={(e) => setAddrLine1(e.target.value)}
                      placeholder="Address *"
                      className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-[10px] focus:outline-none focus:border-orange-500"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={addrCity}
                      onChange={(e) => setAddrCity(e.target.value)}
                      placeholder="City"
                      className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-[10px] focus:outline-none focus:border-orange-500"
                    />
                    <input
                      type="text"
                      value={addrPostalCode}
                      onChange={(e) => setAddrPostalCode(e.target.value)}
                      placeholder="Postal"
                      className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-[10px] focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <input
                    type="text"
                    value={addrInstructions}
                    onChange={(e) => setAddrInstructions(e.target.value)}
                    placeholder="Instructions..."
                    className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-[10px] focus:outline-none focus:border-orange-500"
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleAddAddress}
                      disabled={!addrLine1.trim() || isAddingAddress}
                      className="flex-1 flex items-center justify-center gap-1 py-1 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 text-white text-[10px] font-medium rounded transition-colors"
                    >
                      {isAddingAddress ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                      Save
                    </button>
                    <button
                      onClick={() => setShowAddAddress(false)}
                      className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 text-[10px] rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
