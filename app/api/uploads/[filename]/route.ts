// app/api/uploads/[filename]/route.ts
//
// GET /api/uploads/<filename> — stream a previously uploaded image back to the
// browser from the server's local disk (Docker volume). Files live outside
// `public/`, so this route is what makes stored images actually viewable.
//
// Read access is intentionally public: menu images are shown on customer-facing
// menus and displays, and the filenames are unguessable. Writing still requires
// auth (see /api/upload).
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import {
  UPLOAD_DIR,
  EXT_CONTENT_TYPE,
  isSafeUploadFilename,
} from "@/lib/uploads";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ filename: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { filename } = await ctx.params;

  // Reject anything that isn't one of our generated names. This blocks path
  // traversal (`..`, slashes) and probing for arbitrary files on the volume.
  if (!isSafeUploadFilename(filename)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const contentType = EXT_CONTENT_TYPE[ext];
  if (!contentType) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Defence in depth: resolve and confirm the path stays inside UPLOAD_DIR.
  const filePath = path.join(UPLOAD_DIR, filename);
  const resolved = path.resolve(filePath);
  if (resolved !== path.resolve(UPLOAD_DIR, filename) || !existsSync(resolved)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const file = await readFile(resolved);
    return new NextResponse(new Uint8Array(file), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Filenames are content-unique, so cache aggressively & immutably.
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(file.byteLength),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[uploads] read error:", err);
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
