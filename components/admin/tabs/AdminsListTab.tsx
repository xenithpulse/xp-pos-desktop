// components/admin/tabs/AdminsListTab.tsx
// Staff management — list, create, edit, delete admin users

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  UserPlus,
  Eye,
  EyeOff,
  X,
  Check,
  ChevronDown,
} from 'lucide-react';
import {
  AdminRole,
  AdminPermission,
  ROLE_PERMISSIONS,
  ADMIN_ROLE_LABELS,
  ADMIN_PERMISSION_LABELS,
} from '@/types/admin.types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AdminUser {
  _id: string;
  username: string;
  role: AdminRole;
  permissions: AdminPermission[];
  isActive: boolean;
  createdAt: string;
}

type FormMode = 'create' | 'edit';

interface FormState {
  username: string;
  password: string;
  role: AdminRole;
  isActive: boolean;
}

const EMPTY_FORM: FormState = { username: '', password: '', role: 'waiter', isActive: true };

// ─────────────────────────────────────────────────────────────────────────────
// Role badge colors
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<AdminRole, string> = {
  super_admin: 'bg-red-500/20 text-red-400 border-red-500/30',
  manager: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  cashier: 'bg-green-500/20 text-green-400 border-green-500/30',
  chef: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  waiter: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const ROLE_ICONS: Record<AdminRole, React.ReactNode> = {
  super_admin: <ShieldAlert size={14} />,
  manager: <ShieldCheck size={14} />,
  cashier: <Shield size={14} />,
  chef: <Shield size={14} />,
  waiter: <Shield size={14} />,
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminsListTab() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<AdminRole | 'all'>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch
  // ─────────────────────────────────────────────────────────────────────────

  const fetchAdmins = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin');
      if (res.ok) {
        const data = await res.json();
        setAdmins(data);
      }
    } catch (err) {
      console.error('Failed to fetch admins:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  // ─────────────────────────────────────────────────────────────────────────
  // Filtered list
  // ─────────────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = admins;
    if (roleFilter !== 'all') list = list.filter((a) => a.role === roleFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((a) => a.username.toLowerCase().includes(q));
    }
    return list;
  }, [admins, roleFilter, searchQuery]);

  // ─────────────────────────────────────────────────────────────────────────
  // Form handlers
  // ─────────────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormMode('create');
    setEditId(null);
    setFormError('');
    setShowPassword(false);
    setShowForm(true);
  };

  const openEdit = (admin: AdminUser) => {
    setForm({ username: admin.username, password: '', role: admin.role, isActive: admin.isActive });
    setFormMode('edit');
    setEditId(admin._id);
    setFormError('');
    setShowPassword(false);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditId(null); setFormError(''); };

  const handleSave = async () => {
    setFormError('');
    if (!form.username.trim()) { setFormError('Username is required'); return; }
    if (formMode === 'create' && !form.password) { setFormError('Password is required'); return; }

    setIsSaving(true);
    try {
      if (formMode === 'create') {
        const res = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: form.username.trim(), password: form.password, role: form.role }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setFormError(d.message || 'Failed to create admin');
          return;
        }
      } else if (editId) {
        const body: Record<string, unknown> = {
          username: form.username.trim(),
          role: form.role,
          isActive: form.isActive,
        };
        if (form.password) body.password = form.password;
        const res = await fetch(`/api/admin/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setFormError(d.error || d.message || 'Failed to update admin');
          return;
        }
      }
      closeForm();
      fetchAdmins();
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Delete
  // ─────────────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed to delete admin');
        return;
      }
      setDeleteConfirm(null);
      fetchAdmins();
    } catch {
      alert('Failed to delete admin');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Toggle active
  // ─────────────────────────────────────────────────────────────────────────

  const toggleActive = async (admin: AdminUser) => {
    try {
      await fetch(`/api/admin/${admin._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !admin.isActive }),
      });
      fetchAdmins();
    } catch {
      alert('Failed to toggle status');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Staff Management</h2>
          <p className="text-sm text-[#555]">{admins.length} staff member{admins.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[140px] sm:flex-none">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff..."
              className="w-full sm:w-48 pl-8 pr-3 py-2 bg-[#111] border border-white/[0.08] rounded-lg text-white text-sm placeholder-[#555] focus:outline-none focus:border-white/20"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as AdminRole | 'all')}
            className="px-3 py-2 bg-[#111] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-white/20"
          >
            <option value="all">All Roles</option>
            {(Object.keys(ADMIN_ROLE_LABELS) as AdminRole[]).map((r) => (
              <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>
            ))}
          </select>
          <button
            onClick={fetchAdmins}
            className="p-2 bg-[#111] text-[#888] hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 bg-white text-black hover:bg-white/90 rounded-lg text-sm font-medium transition-colors"
          >
            <UserPlus size={16} />
            <span className="hidden sm:inline">Add Staff</span>
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-[#555]">
          <Shield size={40} className="mb-3 opacity-50" />
          <p>No staff members found</p>
        </div>
      ) : (
        <>
          {/* ── Desktop table ─────────────────────────────────────────── */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="w-full">
              <thead className="bg-[#111]">
                <tr className="text-xs text-[#666] uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Username</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Permissions</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Created</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filtered.map((admin) => (
                  <tr key={admin._id} className="hover:bg-white/[0.03] transition-colors group">
                    <td className="px-4 py-3">
                      <span className="font-medium text-white text-sm">{admin.username}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border ${ROLE_COLORS[admin.role] || 'bg-white/[0.06] text-[#888]'}`}>
                        {ROLE_ICONS[admin.role]}
                        {ADMIN_ROLE_LABELS[admin.role] || admin.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(admin.permissions || ROLE_PERMISSIONS[admin.role] || []).map((p) => (
                          <span key={p} className="px-1.5 py-0.5 bg-white/[0.06] text-[#888] rounded text-[10px]">
                            {ADMIN_PERMISSION_LABELS[p as AdminPermission] || p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActive(admin)}
                        className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                          admin.isActive !== false
                            ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                            : 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                        }`}
                      >
                        {admin.isActive !== false ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#555]">
                      {new Date(admin.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(admin)}
                          className="p-1.5 bg-white/[0.08] hover:bg-white/[0.15] text-white rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={13} />
                        </button>
                        {deleteConfirm === admin._id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(admin._id)}
                              className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                              title="Confirm delete"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="p-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-lg transition-colors"
                              title="Cancel"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(admin._id)}
                            className="p-1.5 bg-red-600/80 hover:bg-red-500 text-white rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Mobile cards ──────────────────────────────────────────── */}
          <div className="md:hidden flex flex-col gap-3">
            {filtered.map((admin) => (
              <motion.div
                key={admin._id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#111] border border-white/[0.08] rounded-xl p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium text-white text-sm">{admin.username}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${ROLE_COLORS[admin.role]}`}>
                        {ROLE_ICONS[admin.role]}
                        {ADMIN_ROLE_LABELS[admin.role] || admin.role}
                      </span>
                      <button
                        onClick={() => toggleActive(admin)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          admin.isActive !== false
                            ? 'bg-green-500/15 text-green-400'
                            : 'bg-red-500/15 text-red-400'
                        }`}
                      >
                        {admin.isActive !== false ? 'Active' : 'Disabled'}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(admin)} className="p-1.5 bg-white/[0.08] hover:bg-white/[0.15] text-white rounded-lg">
                      <Edit2 size={12} />
                    </button>
                    {deleteConfirm === admin._id ? (
                      <>
                        <button onClick={() => handleDelete(admin._id)} className="p-1.5 bg-red-600 text-white rounded-lg">
                          <Check size={12} />
                        </button>
                        <button onClick={() => setDeleteConfirm(null)} className="p-1.5 bg-white/[0.06] text-white rounded-lg">
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setDeleteConfirm(admin._id)} className="p-1.5 bg-red-600/80 text-white rounded-lg">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {(admin.permissions || ROLE_PERMISSIONS[admin.role] || []).map((p) => (
                    <span key={p} className="px-1.5 py-0.5 bg-white/[0.06] text-[#888] rounded text-[10px]">
                      {ADMIN_PERMISSION_LABELS[p as AdminPermission] || p}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* ── Create / Edit Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={closeForm}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0a0a0a] border border-white/[0.1] rounded-2xl w-full max-w-md shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
                <h3 className="text-base font-semibold text-white">
                  {formMode === 'create' ? 'Add Staff Member' : 'Edit Staff Member'}
                </h3>
                <button onClick={closeForm} className="p-1 text-[#888] hover:text-white">
                  <X size={18} />
                </button>
              </div>

              {/* Modal body */}
              <div className="px-5 py-4 space-y-4">
                {formError && (
                  <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                    {formError}
                  </div>
                )}

                {/* Username */}
                <div>
                  <label className="block text-xs text-[#888] mb-1.5 font-medium">Username</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#111] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-white/20"
                    placeholder="Enter username"
                    autoFocus
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs text-[#888] mb-1.5 font-medium">
                    Password {formMode === 'edit' && <span className="text-[#555]">(leave empty to keep current)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      className="w-full px-3 py-2 pr-10 bg-[#111] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-white/20"
                      placeholder={formMode === 'create' ? 'Enter password' : '••••••••'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#ccc]"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Role */}
                <div>
                  <label className="block text-xs text-[#888] mb-1.5 font-medium">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminRole }))}
                    className="w-full px-3 py-2 bg-[#111] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-white/20"
                  >
                    {(Object.keys(ADMIN_ROLE_LABELS) as AdminRole[]).map((r) => (
                      <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>

                {/* Permissions preview */}
                <div>
                  <label className="block text-xs text-[#888] mb-1.5 font-medium">Permissions (auto-assigned by role)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(ROLE_PERMISSIONS[form.role] || []).map((p) => (
                      <span key={p} className="px-2 py-1 bg-white/[0.06] text-[#ccc] border border-white/[0.08] rounded-lg text-xs">
                        {ADMIN_PERMISSION_LABELS[p] || p}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Active toggle (edit only) */}
                {formMode === 'edit' && (
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-[#888] font-medium">Account Active</label>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                      className={`relative w-10 h-5 rounded-full transition-colors ${form.isActive ? 'bg-green-600' : 'bg-white/[0.1]'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${form.isActive ? 'translate-x-5' : ''}`}
                      />
                    </button>
                  </div>
                )}
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/[0.08]">
                <button
                  onClick={closeForm}
                  className="px-4 py-2 bg-white/[0.06] text-[#888] hover:bg-white/[0.1] rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 bg-white text-black hover:bg-white/90 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : formMode === 'create' ? 'Create' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
