// lib/uploads.ts
// Shared helpers for local (server-disk) image storage.
//
// Uploaded files live OUTSIDE the Next.js `public/` tree — under the appliance
// data root at UPLOAD_DIR (C:\ProgramData\XP POS\uploads on a native install).
// Because they are not statically served, they are written here by the POST
// route (/api/upload) and streamed back out by the GET route
// (/api/uploads/[filename]). Both routes import from this module so the
// directory, the allow-list, and the filename rules can never drift apart.
//
// UPLOAD_DIR must never point inside "C:\Program Files\XP POS" — an installer
// upgrade replaces that tree wholesale and would delete every menu image.

import path from "path";

// Resolve the storage directory once. Falls back to a local public folder for
// `next dev` on a workstation (where no appliance data root exists).
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "public", "uploads");

// MIME type → file extension. Raster images only. SVG is deliberately excluded:
// it can carry inline <script>, which would run when the image is opened
// same-origin. Keeping the map here is also the type allow-list.
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

// Reverse map (extension → content-type) for the serving route.
export const EXT_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

// Max upload size (bytes). Mirrors the client-side guard in FormsTab.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

// Generated filenames only ever contain these characters. The serving route
// rejects anything else, which blocks path traversal (`..`, `/`, `\`) and any
// attempt to read arbitrary files off the volume.
const SAFE_FILENAME = /^[a-z0-9]+-[a-z0-9]+\.[a-z0-9]+$/i;

export function isSafeUploadFilename(name: string): boolean {
  return SAFE_FILENAME.test(name);
}

// Build a collision-resistant, safe filename for a given extension.
export function makeUploadFilename(ext: string): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
}
