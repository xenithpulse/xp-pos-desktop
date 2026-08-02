"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FaPlus,
  FaEdit,
  FaTrash,
  FaSpinner,
  FaExclamationCircle,
  FaUser,
  FaLock,
  FaTag,
  FaCheckCircle,
  FaTimesCircle,
  FaSave,
  FaTimes,
  FaUsers,
  FaCalendarAlt,
  FaSearch,
  FaShieldAlt,
} from "react-icons/fa";
import { AnimatePresence, motion } from "framer-motion";
import {
  type AdminRole,
  type AdminPermission,
  ADMIN_ROLE_LABELS,
  ADMIN_PERMISSION_LABELS,
  ROLE_PERMISSIONS,
} from "@/types/admin.types";

const ROLE_OPTIONS = Object.keys(ROLE_PERMISSIONS) as AdminRole[];

interface Admin {
  _id: string;
  username: string;
  role: AdminRole;
  permissions: AdminPermission[];
  isActive: boolean;
  createdAt: string;
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [editId, setEditId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminRole>("waiter");
  const [isActive, setIsActive] = useState(true);

  // Notifications state
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Function to show notifications
  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    const timer = setTimeout(() => {
      setNotification(null);
    }, 4000); // Notification disappears after 4 seconds
    return () => clearTimeout(timer);
  };

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch("/api/admin");
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to fetch admins.");
      }
      setAdmins(await res.json());
    } catch (e) {
      const message = e instanceof Error ? e.message : "An unexpected error occurred.";
      setError(message);
      showNotification(`Error fetching admins: ${message}`, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  function startCreate() {
    setEditId(null);
    setUsername("");
    setPassword("");
    setRole("waiter");
    setIsActive(true);
    setError(undefined);
  }

  function startEdit(admin: Admin) {
    setEditId(admin._id);
    setUsername(admin.username);
    setPassword("");
    setRole(admin.role);
    setIsActive(admin.isActive);
    setError(undefined);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (!username.trim()) {
      setError("Username is required.");
      showNotification("Username is required.", 'error');
      return;
    }
    if (!editId && !password.trim()) {
      setError("Password is required for new admins.");
      showNotification("Password is required for new admins.", 'error');
      return;
    }

    const payload: Record<string, unknown> = {
      username,
      role,
      isActive,
    };

    if (password) payload.password = password;
    setLoading(true);

    try {
      const url = editId ? `/api/admin/${editId}` : "/api/admin";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || res.statusText || "Operation failed.");
      }

      await fetchAdmins();
      startCreate();
      showNotification(editId ? "Admin updated successfully!" : "Admin created successfully!", 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : "An unexpected error occurred.";
      setError(message);
      showNotification(`Operation failed: ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Confirm deletion of this admin?")) {
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to delete admin.");
      }
      setAdmins((a) => a.filter((x) => x._id !== id));
      if (editId === id) startCreate();
      showNotification("Admin deleted successfully!", 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : "An unexpected error occurred.";
      setError(message);
      showNotification(`Delete failed: ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  const filteredAdmins = admins.filter(admin =>
    admin.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    admin.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- Animation Variants ---
  const fadeInVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  };
  const toastVariants = {
    hidden: { opacity: 0, x: 50 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 50 },
  };

  return (
    <div className="min-h-screen bg-transparent text-gray-900 py-4 sm:py-8 font-mono">
      <div className="max-w-8xl mx-auto space-y-8">
        {/* Global Notification Area */}
        <AnimatePresence>
          {notification && (
            <motion.div
              variants={toastVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className={`fixed top-4 right-4 z-50 flex items-center px-4 py-2 border text-sm font-semibold rounded-sm transition-all duration-300 ${
                notification.type === 'success'
                  ? 'bg-green-600 border-green-700 text-white'
                  : 'bg-red-600 border-red-700 text-white'
              }`}
            >
              {notification.type === 'success' ? <FaCheckCircle className="mr-2 text-lg" /> : <FaExclamationCircle className="mr-2 text-lg" />}
              {notification.message}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Admin Form Section */}
        <motion.section
          variants={fadeInVariants}
          initial="hidden"
          animate="visible"
          className="p-6 border border-gray-900 rounded-sm bg-transparent"
        >
          <h2 className="text-xl font-bold uppercase mb-6 flex items-center gap-3">
            {editId ? (
              <FaEdit className="text-gray-900" />
            ) : (
              <FaPlus className="text-green-600" />
            )}{" "}
            {editId ? "Edit Admin Details" : "Create New Admin Account"}
          </h2>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-xs font-semibold uppercase text-gray-700 mb-1">
                <FaUser className="inline-block mr-2 text-gray-500" />Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-900 text-sm focus:outline-none focus:border-green-600 bg-transparent"
                placeholder="e.g., john.doe"
              />
            </div>
            
            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase text-gray-700 mb-1">
                <FaLock className="inline-block mr-2 text-gray-500" />
                {editId ? "New Password (Optional)" : "Password"}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                {...(!editId && { required: true })}
                className="mt-1 block w-full px-3 py-2 border border-gray-900 text-sm focus:outline-none focus:border-green-600 bg-transparent"
                placeholder={editId ? "Leave blank to keep current" : "Enter a strong password"}
              />
            </div>
            
            {/* Role */}
            <div>
              <label htmlFor="role" className="block text-xs font-semibold uppercase text-gray-700 mb-1">
                <FaTag className="inline-block mr-2 text-gray-500" />Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as AdminRole)}
                className="mt-1 block w-full px-3 py-2 border border-gray-900 text-sm focus:outline-none focus:border-green-600 bg-transparent appearance-none transition duration-200 cursor-pointer"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r} className="bg-white text-gray-900">
                    {ADMIN_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              {/* Permissions preview for selected role */}
              <div className="mt-2 flex flex-wrap gap-1">
                {(ROLE_PERMISSIONS[role] || []).map((perm) => (
                  <span key={perm} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase border border-gray-400 text-gray-600 rounded-sm">
                    <FaShieldAlt className="w-2.5 h-2.5" />
                    {ADMIN_PERMISSION_LABELS[perm]}
                  </span>
                ))}
              </div>
            </div>
            
            {/* Active Status & Buttons */}
            <div className="md:col-span-3 flex justify-between items-center pt-2 border-t border-gray-200 mt-4">
                {/* Active Checkbox */}
                <div className="flex items-center space-x-3">
                    <input
                        id="isActive"
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        className="form-checkbox h-4 w-4 border-gray-900 text-gray-900 focus:ring-green-600 cursor-pointer"
                    />
                    <label htmlFor="isActive" className="text-sm font-semibold uppercase text-gray-700 flex items-center select-none cursor-pointer">
                        {isActive ? <FaCheckCircle className="mr-2 text-green-600" /> : <FaTimesCircle className="mr-2 text-red-600" />}
                        Account Status: {isActive ? 'ACTIVE' : 'INACTIVE'}
                    </label>
                </div>
                
                {/* Action Buttons */}
                <div className="flex space-x-3">
                    {editId && (
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            type="button"
                            onClick={startCreate}
                            className="inline-flex items-center px-4 py-2 border border-gray-900 text-sm font-semibold rounded-sm text-gray-900 bg-transparent hover:bg-gray-100 transition-all duration-200"
                            disabled={loading}
                        >
                            <FaTimes className="mr-2 h-4 w-4" />
                            CANCEL EDIT
                        </motion.button>
                    )}
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        type="submit"
                        className={`inline-flex items-center px-4 py-2 border text-sm font-semibold rounded-sm text-white transition-all duration-200 ${
                            loading ? 'bg-gray-500 border-gray-500' : 'bg-gray-900 border-gray-900 hover:bg-green-600 hover:border-green-600'
                        }`}
                        disabled={loading}
                    >
                        {loading ? <FaSpinner className="animate-spin mr-2 h-4 w-4" /> : <FaSave className="mr-2 h-4 w-4" />}
                        {editId ? "SAVE CHANGES" : "CREATE ADMIN"}
                    </motion.button>
                </div>
            </div>
          </form>
        </motion.section>

        {/* All Admins List Section */}
        <motion.section
          variants={fadeInVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="p-6 border border-gray-900 rounded-sm bg-transparent"
        >
          <h2 className="text-xl font-bold uppercase mb-6 flex items-center gap-3">
            <FaUsers className="text-gray-900" /> ADMIN DIRECTORY
          </h2>

          {/* Search Bar */}
          <div className="mb-6 relative">
            <input
              type="text"
              placeholder="SEARCH: username or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-900 text-sm focus:outline-none focus:border-green-600 bg-transparent"
            />
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-3 h-3" />
          </div>

          {/* Loading / Empty / Data Display */}
          {loading && !admins.length ? (
            <div className="flex justify-center items-center py-10 border border-dashed border-gray-400">
              <FaSpinner className="animate-spin text-gray-700 text-2xl mr-4" />
              <p className="text-gray-700 text-sm font-medium">Loading admin records...</p>
            </div>
          ) : filteredAdmins.length === 0 ? (
            <p className="text-gray-700 text-center py-10 border border-dashed border-gray-400 text-sm">
              {admins.length === 0
                ? "No admin accounts found."
                : `No admins match "${searchQuery}".`
              }
            </p>
          ) : (
            <div className="overflow-x-auto border border-gray-900">
              <table className="min-w-full divide-y divide-gray-900 text-sm">
                <thead className="bg-gray-100 text-gray-900 uppercase tracking-wider border-b border-gray-900">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left font-bold">Username</th>
                    <th scope="col" className="px-4 py-2 text-left font-bold">Role</th>
                    <th scope="col" className="px-4 py-2 text-left font-bold">Status</th>
                    <th scope="col" className="px-4 py-2 text-left font-bold"><FaCalendarAlt className="inline-block mr-1" /> Created On</th>
                    <th scope="col" className="px-4 py-2 text-center font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredAdmins.map((admin) => (
                    <motion.tr
                        key={admin._id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.15 }}
                        className="hover:bg-gray-50 transition-colors duration-150"
                    >
                      {/* Username */}
                      <td className="px-4 py-3 whitespace-nowrap font-medium">{admin.username}</td>
                      
                      {/* Role (Accent on Super Admin) */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold border rounded-sm ${
                            admin.role === 'super_admin' ? 'text-red-600 border-red-600'
                            : admin.role === 'manager' ? 'text-amber-600 border-amber-600'
                            : 'text-gray-700 border-gray-400'
                          }`}
                        >
                          {ADMIN_ROLE_LABELS[admin.role] || admin.role}
                        </span>
                      </td>
                      
                      {/* Status (Green/Red indication) */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {admin.isActive ? (
                          <span className="flex items-center text-green-600 font-semibold">
                            <FaCheckCircle className="mr-1" /> ACTIVE
                          </span>
                        ) : (
                          <span className="flex items-center text-red-600 font-semibold">
                            <FaTimesCircle className="mr-1" /> INACTIVE
                          </span>
                        )}
                      </td>
                      
                      {/* Created On */}
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {new Date(admin.createdAt).toLocaleDateString("en-PK", {
                          year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      
                      {/* Actions */}
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="flex justify-center space-x-3 text-gray-900">
                          <motion.button
                            whileHover={{ scale: 1.2, color: '#16A34A' }} // Hover to green
                            whileTap={{ scale: 0.9 }}
                            onClick={() => startEdit(admin)}
                            title="Edit Admin"
                            disabled={loading}
                          >
                            <FaEdit className="w-4 h-4" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.2, color: '#DC2626' }} // Hover to red
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleDelete(admin._id)}
                            title="Delete Admin"
                            disabled={loading}
                          >
                            <FaTrash className="w-4 h-4" />
                          </motion.button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.section>
      </div>
    </div>
  );
}