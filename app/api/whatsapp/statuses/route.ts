import { NextResponse } from 'next/server';
import { getStatusGroups } from '@/lib/whatsapp/statuses';
import { isConnected } from '@/lib/whatsapp/client';

export async function GET() {
  try {
    if (!isConnected()) {
      return NextResponse.json(
        { error: 'WhatsApp no está conectado' },
        { status: 400 }
      );
    }

    const groups = getStatusGroups();
    return NextResponse.json({ groups, total: groups.length });
  } catch (error: any) {
    console.error('[WhatsApp Statuses API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener estados' },
      { status: 500 }
    );
  }
}
