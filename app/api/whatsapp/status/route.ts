import { NextResponse } from 'next/server';
import { getConnectionState, isConnected, getQRCode } from '@/lib/whatsapp/client';

export async function GET() {
  const state = getConnectionState();
  const connected = isConnected();
  const qrAvailable = getQRCode() !== null;

  return NextResponse.json({
    connected,
    connecting: state === 'connecting',
    qrAvailable,
    authenticated: connected,
  });
}
