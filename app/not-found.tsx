// app/not-found.tsx
"use client";

import { Home, ArrowLeft, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();
  const whatsappLink = "https://wa.me/923197114830";

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* 404 Text */}
        <div className="mb-6">
          <span className="text-8xl font-bold text-neutral-800">404</span>
        </div>

        {/* Message */}
        <h1 className="text-xl font-semibold mb-2">Page not found</h1>
        <p className="text-neutral-500 text-sm mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg transition-colors text-neutral-300"
          >
            <ArrowLeft size={16} />
            Go Back
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-white text-black hover:bg-neutral-200 rounded-lg transition-colors"
          >
            <Home size={16} />
            Home
          </Link>
        </div>

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
