import { NextResponse } from 'next/server';
import { getAvatarUrl } from '@/lib/whatsapp/avatars';
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
    const jid = searchParams.get('jid');

    if (!jid) {
      return NextResponse.json({ error: 'jid es requerido' }, { status: 400 });
    }

    const url = await getAvatarUrl(jid);
    return NextResponse.json({ url });
  } catch (error: any) {
    console.error('[WhatsApp Avatar API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener foto de perfil' },
      { status: 500 }
    );
  }
}
