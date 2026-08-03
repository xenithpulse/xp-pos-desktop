// app/api/daily-sheet/edit-context/route.ts
//
// Per-user daily-sheet editing context (which day the user is working on).
//   GET — the caller's current targetDate (null = today)
//   PUT — set it, then fan the change out to the user's other tabs/devices via
//         a best-effort realtime message addressed to that user's sockets
import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { getSession } from '@/lib/auth';
import { EditContextModel } from '@/models/factories/EditContext';
import { sendToUser } from '@/lib/realtime/eventBus';
import { DAILY_SHEET_EDIT_CONTEXT_EVENT } from '@/lib/realtime/types';
import { isYMD } from '@/utils/dailySheetOpening';

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
  //
  // Addressing is by username rather than a channel name: the WebSocket server
  // records the authenticated user on each socket at upgrade time, so there is
  // no channel to subscribe to and no name to sanitise. sendToUser never
  // throws, so no try/catch is needed here.
  const username = session.user.name;
  if (username) {
    sendToUser(username, {
      type: DAILY_SHEET_EDIT_CONTEXT_EVENT,
      targetDate,
      originTabId,
    });
  }

  return NextResponse.json({ ok: true, targetDate });
}
