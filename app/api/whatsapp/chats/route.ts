import { NextResponse } from 'next/server';
import { getChats } from '@/lib/whatsapp/chats';
import { isConnected } from '@/lib/whatsapp/client';

export async function GET() {
  try {
    if (!isConnected()) {
      return NextResponse.json(
        { error: 'WhatsApp no está conectado' },
        { status: 400 }
      );
    }

    const chats = await getChats();

    return NextResponse.json({
      chats,
      total: chats.length,
    });
  } catch (error: any) {
    console.error('[WhatsApp Chats API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener chats' },
      { status: 500 }
    );
  }
}
