// app/api/daily-sheet/edit-context/route.ts
//
// Per-user daily-sheet editing context (which day the user is working on).
//   GET — the caller's current targetDate (null = today)
//   PUT — set it, then fan the change out to the user's other tabs/devices via
//         a best-effort Pusher event on their private channel
import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { getSession } from '@/lib/auth';
import { EditContextModel } from '@/models/factories/EditContext';
import { pusherServer } from '@/lib/realtime/pusher-server';
import { isYMD } from '@/utils/dailySheetOpening';

function sanitizeUser(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const conn = await mongooseConnect();
  const EditContext = EditContextModel(conn);
  const doc = await EditContext.findOne({ userId: session.user.id }).lean();

  return NextResponse.json({ targetDate: doc?.targetDate ?? null });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { targetDate?: unknown; originTabId?: unknown };

  // Normalize: only accept null or a valid YYYY-MM-DD.
  const targetDate: string | null = isYMD(body.targetDate) ? (body.targetDate as string) : null;
  const originTabId = typeof body.originTabId === 'string' ? body.originTabId : undefined;

  const conn = await mongooseConnect();
  const EditContext = EditContextModel(conn);

  await EditContext.findOneAndUpdate(
    { userId: session.user.id },
    { userId: session.user.id, username: session.user.name ?? undefined, targetDate },
    { upsert: true, new: true },
  );

  // Fan out to the user's other tabs/devices. Best-effort — realtime is an
  // enhancement; single-device continuity is covered by the GET on mount.
  const username = session.user.name;
  if (pusherServer && username) {
    try {
      await pusherServer.trigger(
        `private-user-${sanitizeUser(username)}`,
        'daily_sheet_edit_context_changed',
        { targetDate, originTabId },
      );
    } catch (err) {
      console.warn('[edit-context] pusher trigger failed (non-fatal):', err);
    }
  }

  return NextResponse.json({ ok: true, targetDate });
}
