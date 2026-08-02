// app/api/upload/route.ts
//
// POST /api/upload — accept image file(s) and store them on the server's local
// disk (a Docker volume in production). Returns servable URLs of the form
// `/api/uploads/<filename>` which are streamed back by the sibling GET route.
import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { isAdminRequest } from "@/lib/auth";
import {
  UPLOAD_DIR,
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  makeUploadFilename,
} from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Menu managers (item images) OR settings managers (business logo) may upload.
  // Try the menu permission first; fall back to the settings permission so a
  // settings-only admin can still add a logo.
  const deniedMenu = await isAdminRequest({ requiredPerm: "manage_menu" });
  if (deniedMenu) {
    const deniedSettings = await isAdminRequest({ requiredPerm: "manage_settings" });
    if (deniedSettings) return deniedSettings;
  }

  try {
    const formData = await request.formData();
    const blobs = formData.getAll("file").filter((f): f is File => f instanceof File);

    if (blobs.length === 0) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    // Ensure the storage directory exists (first run / fresh volume).
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const uploadedUrls: string[] = [];

    for (const blob of blobs) {
      // Validate type against the server-side allow-list (never trust the client).
      const ext = ALLOWED_IMAGE_TYPES[blob.type];
      if (!ext) {
        return NextResponse.json(
          { error: "Unsupported file type. Use PNG, JPG, WebP, GIF or AVIF." },
          { status: 415 }
        );
      }

      // Validate size server-side too — the client guard can be bypassed.
      if (blob.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "Each image must be 5MB or smaller." },
          { status: 413 }
        );
      }

      const filename = makeUploadFilename(ext);
      const buffer = Buffer.from(await blob.arrayBuffer());
      await writeFile(path.join(UPLOAD_DIR, filename), buffer);

      uploadedUrls.push(`/api/uploads/${filename}`);
    }

    return NextResponse.json({ links: uploadedUrls }, { status: 200 });
  } catch (err) {
    console.error("[upload] error:", err);
    return NextResponse.json({ error: "Failed to store image." }, { status: 500 });
  }
}
