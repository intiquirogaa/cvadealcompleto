import { NextResponse } from 'next/server';
import { logout } from '@/lib/whatsapp/client';

export async function POST() {
  try {
    await logout();

    return NextResponse.json({
      success: true,
      message: 'Sesión cerrada correctamente',
    });
  } catch (error: any) {
    console.error('[WhatsApp Logout API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al cerrar sesión' },
      { status: 500 }
    );
  }
}
