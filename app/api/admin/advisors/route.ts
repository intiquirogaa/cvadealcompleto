export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import bcrypt from 'bcryptjs';

// GET /api/admin/advisors - list all advisors
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any)?.role !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const advisors = await prisma.user.findMany({
      where: { role: { in: ['advisor'] } },
      select: {
        id: true, name: true, email: true, phone: true, role: true, createdAt: true,
        assignedAppointments: { select: { id: true, status: true } },
      },
    });
    return NextResponse.json(advisors);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json([], { status: 500 });
  }
}

// POST /api/admin/advisors - create a new advisor
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any)?.role !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const { name, email, password, phone } = await req.json();
    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Nombre, email y contraseña son requeridos' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 400 });
    }
    const hash = await bcrypt.hash(password, 10);
    const advisor = await prisma.user.create({
      data: { name, email, passwordHash: hash, phone: phone ?? '', role: 'advisor' },
    });
    return NextResponse.json({ id: advisor.id, name: advisor.name, email: advisor.email, role: advisor.role });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Error al crear asesor' }, { status: 500 });
  }
}
