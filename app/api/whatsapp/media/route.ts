import { NextResponse } from 'next/server';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getRawMessage } from '@/lib/whatsapp/messages';
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
    const messageId = searchParams.get('id');

    if (!messageId) {
      return NextResponse.json(
        { error: 'id es requerido' },
        { status: 400 }
      );
    }

    const rawMessage = getRawMessage(messageId);
    if (!rawMessage) {
      // Either the message wasn't media, or it arrived in an earlier
      // process lifetime — the raw (encrypted) message isn't persisted
      // to disk, see messages.ts for why.
      return NextResponse.json(
        { error: 'Media no disponible (puede haber expirado o el servidor se reinició)' },
        { status: 404 }
      );
    }

    const buffer = await downloadMediaMessage(rawMessage, 'buffer', {});

    const mediaContent =
      rawMessage.message?.imageMessage ||
      rawMessage.message?.videoMessage ||
      rawMessage.message?.audioMessage ||
      rawMessage.message?.documentMessage ||
      rawMessage.message?.stickerMessage;

    const headers: Record<string, string> = {
      'Content-Type': mediaContent?.mimetype || 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    };
    if (mediaContent?.fileName) {
      headers['Content-Disposition'] = `inline; filename="${mediaContent.fileName}"`;
    }

    return new NextResponse(buffer, { headers });
  } catch (error: any) {
    console.error('[WhatsApp Media API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al descargar media' },
      { status: 500 }
    );
  }
}
