import { NextResponse } from 'next/server';
import { getMessages } from '@/lib/whatsapp/messages';
import { isConnected } from '@/lib/whatsapp/client';

export async function GET(request: Request) {
  try {
    if (!isConnected()) {
      return NextResponse.json(
        { error: 'WhatsApp no está conectado' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('id');

    if (!chatId) {
      return NextResponse.json(
        { error: 'chatId es requerido' },
        { status: 400 }
      );
    }

    const messages = await getMessages(chatId);

    return NextResponse.json({
      messages: messages.reverse(),
      total: messages.length,
    });
  } catch (error: any) {
    console.error('[WhatsApp Messages API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener mensajes' },
      { status: 500 }
    );
  }
}
