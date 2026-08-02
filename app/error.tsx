// app/error.tsx
"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Home, AlertTriangle, MessageCircle, Phone, ChevronDown, Copy, Check } from "lucide-react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const whatsappLink = "https://wa.me/923197114830";

  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  const copyErrorDetails = () => {
    const details = `Error: ${error.message}\nDigest: ${error.digest || "N/A"}`;
    navigator.clipboard.writeText(details);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Error Icon */}
        <div className="mb-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle size={32} className="text-red-400" />
          </div>
        </div>

        {/* Message */}
        <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
        <p className="text-neutral-500 text-sm mb-2">
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p className="text-neutral-700 text-xs font-mono mb-6">
            ID: {error.digest}
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-white text-black hover:bg-neutral-200 rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg transition-colors text-neutral-300"
          >
            <Home size={16} />
            Home
          </Link>
        </div>

        {/* Technical Details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="inline-flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-500 transition-colors mb-4"
        >
          <span>Details</span>
          <ChevronDown size={14} className={`transition-transform ${showDetails ? "rotate-180" : ""}`} />
        </button>

        {showDetails && (
          <div className="mb-6 p-3 bg-neutral-900 border border-neutral-800 rounded-lg text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-neutral-600">Error</span>
              <button
                onClick={copyErrorDetails}
                className="text-xs text-neutral-600 hover:text-neutral-400 flex items-center gap-1"
              >
                {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-red-400 font-mono break-all">
              {error.message || "Unknown error"}
            </p>
          </div>
        )}

        {/* Contact Section */}
        <div className="pt-6 border-t border-neutral-900">
          <p className="text-neutral-600 text-xs uppercase tracking-wider mb-3">
            Need Help?
          </p>
          <p className="text-neutral-400 text-sm mb-4">
            Contact <span className="text-white font-medium">XenithPulse</span> for support
          </p>
          <div className="flex items-center justify-center gap-3">
            <a
              href="tel:+923197114830"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-md transition-colors"
            >
              <Phone size={14} />
              +92-319-7114830
            </a>
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-md transition-colors"
            >
              <MessageCircle size={14} />
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
