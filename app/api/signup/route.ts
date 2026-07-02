export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name, phone } = body ?? {};
    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'El email ya esta registrado' }, { status: 400 });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, name, phone: phone ?? '' },
    });
    return NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e: any) {
    console.error('Signup error:', e);
    return NextResponse.json({ error: 'Error al crear cuenta' }, { status: 500 });
  }
}
