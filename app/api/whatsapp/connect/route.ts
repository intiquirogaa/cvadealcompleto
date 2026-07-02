import { NextResponse } from 'next/server';
import { connect, disconnect, getConnectionState, getQRCode } from '@/lib/whatsapp/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    console.log('[WhatsApp Connect API] Action:', action);

    if (action === 'connect') {
      const status = getConnectionState();
      console.log('[WhatsApp Connect API] Current status:', status);
      
      if (status === 'connected' || status === 'connecting') {
        return NextResponse.json({
          status,
          message: status === 'connected' ? 'Ya está conectado' : 'Conectando...',
          qrCode: null,
        });
      }

      console.log('[WhatsApp Connect API] Starting connection...');
      await connect();
      
      return NextResponse.json({
        status: getConnectionState(),
        message: 'Iniciando conexión...',
        qrCode: getQRCode(),
      });
    }

    if (action === 'disconnect') {
      await disconnect();
      return NextResponse.json({
        status: 'disconnected',
        message: 'Desconectado',
        qrCode: null,
      });
    }

    if (action === 'clear') {
      const { logout } = await import('@/lib/whatsapp/client');
      await logout();
      return NextResponse.json({
        status: 'disconnected',
        message: 'Sesión limpiada',
        qrCode: null,
      });
    }

    return NextResponse.json(
      { error: 'Acción no válida' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[WhatsApp Connect API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al conectar' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const status = getConnectionState();
    const qrCode = getQRCode();

    console.log('[WhatsApp Connect API] GET - Status:', status);

    return NextResponse.json({
      status,
      qrCode,
    });
  } catch (error: any) {
    console.error('[WhatsApp Connect API] GET Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener estado' },
      { status: 500 }
    );
  }
}
