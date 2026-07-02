import { NextResponse } from 'next/server';
import { getQRCode } from '@/lib/whatsapp/client';

export async function GET() {
  const qr = getQRCode();

  if (!qr) {
    return NextResponse.json({ error: 'QR not available' }, { status: 404 });
  }

  return NextResponse.json({ qr });
}
