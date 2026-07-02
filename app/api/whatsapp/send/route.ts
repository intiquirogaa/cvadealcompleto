import { NextResponse } from 'next/server';
import { sendMessage } from '@/lib/whatsapp/messages';
import { isConnected } from '@/lib/whatsapp/client';

export async function POST(request: Request) {
  try {
    if (!isConnected()) {
      return NextResponse.json(
        { error: 'WhatsApp no está conectado' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { chatId, message } = body;

    if (!chatId || !message) {
      return NextResponse.json(
        { error: 'chatId y message son requeridos' },
        { status: 400 }
      );
    }

    await sendMessage(chatId, message);

    return NextResponse.json({
      success: true,
      message: 'Mensaje enviado',
    });
  } catch (error: any) {
    console.error('[WhatsApp Send API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al enviar mensaje' },
      { status: 500 }
    );
  }
}
