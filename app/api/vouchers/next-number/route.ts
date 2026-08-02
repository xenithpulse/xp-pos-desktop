// app/api/vouchers/next-number/route.ts
//
// Predicts the next voucher copy/unique number WITHOUT consuming it, so the
// expense list can show the real number optimistically on "Post" instead of a
// "—" placeholder. getManualVoucherNumber() derives the number from the latest
// existing voucher — it has no side effects, so peeking here is safe.
import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth';
import { getManualVoucherNumber } from '@/lib/helpers/getManualVoucherNum';

export async function GET() {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  try {
    const info = await getManualVoucherNumber();
    if ('requiresNewConfig' in info && info.requiresNewConfig) {
      return NextResponse.json({ requiresNewConfig: true, message: info.message });
    }
    return NextResponse.json({
      copyNumber: info.copyNumber,
      uniqueNumber: info.uniqueNumber,
      requiresNewConfig: false,
    });
  } catch (err) {
    console.error('[vouchers next-number] failed:', err);
    // Non-fatal: the client falls back to a "—" placeholder.
    return NextResponse.json(
      { requiresNewConfig: false, error: 'Failed to predict next voucher number.' },
      { status: 500 },
    );
  }
}
