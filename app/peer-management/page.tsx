"use client";

import React, { useState, JSX } from "react";
import { motion } from "framer-motion"; // Import motion
import RequirePermission from "@/components/auth/RequirePermission";
import AdminsPage from "@/features/PeerManagement/Admins";
import StaffPage from "@/features/PeerManagement/StaffManagement";

// Minimalist Icon Placeholders
const IconAdmins = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c-1.334-.73-2.73-1.12-4.14-1.12H10c-3.87 0-7 3.13-7 7v2h14v-2c0-2.2-.9-4.2-2.39-5.61A6 6 0 1 0 15 14z"></path></svg>
);
const IconStaff = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="18" y1="8" x2="18" y2="15"></line><line x1="21" y1="12" x2="15" y2="12"></line></svg>
);

export default function PeerManagement() {
  return (
    <RequirePermission permission="manage_staff">
      <PeerManagementInner />
    </RequirePermission>
  );
}

function PeerManagementInner() {
  const [activeTab, setActiveTab] = useState<"admins" | "staff">("admins");

  // Define tabs with icons for a professional look
  const tabs: {
    id: "admins" | "staff";
    label: string;
    component: JSX.Element;
    icon: (props: { className?: string }) => JSX.Element;
  }[] = [
    { id: "admins", label: "Admins", component: <AdminsPage />, icon: IconAdmins },
    { id: "staff", label: "Staff Management", component: <StaffPage />, icon: IconStaff },
  ];

  return (
    // Outer container adapted for the new theme: bg-transparent, no shadows
    // Note: We retain the Layout component but strip its styling within this component's wrapper.
    <div className="flex flex-col items-center p-4 md:p-8 min-h-screen bg-white font-mono text-gray-900">
        
        {/* Main Content Wrapper: No shadow, border remains the key separator */}
        <div className="w-full max-w-425 rounded-sm bg-transparent min-h-[80vh]">
          
          {/* Header/Title Area */}
          <div className="px-6 pt-4 pb-2 border-b border-gray-900">
            <h1 className="text-xl font-bold uppercase tracking-wider">
              Peer Management Console
            </h1>
            <p className="text-xs text-gray-600 mt-1">
              Control and manage privileged users and staff payroll records.
            </p>
          </div>

          {/* --- Enhanced Tab Navigation --- */}
          <div className="flex w-full relative border-b border-gray-900/0">
            {tabs.map((tab) => (
              <motion.button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative py-3 px-8 text-sm font-semibold uppercase tracking-wider flex items-center gap-2 transition-colors duration-200 focus:outline-none 
                  ${
                    activeTab === tab.id
                      ? "text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }
                `}
                whileHover={{ backgroundColor: "#f3f4f6" }} // Slight hover for feedback
              >
                {/* Active Tab Indicator (Underline effect) */}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute bottom-0 left-0 w-full h-0.75 bg-green-600"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </motion.button>
            ))}
          </div>

          {/* --- Tab Content --- */}
          <div className="p-6">
            {/* Use AnimatePresence or conditional mounting if child components handle their own animations, but here we just render the active one for simplicity. */}
            {tabs.find((tab) => tab.id === activeTab)?.component}
          </div>
        </div>
      </div>
  );
}