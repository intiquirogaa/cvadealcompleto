export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// PUT /api/admin/users/[id] - change user role
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any)?.role !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const { role } = await req.json();
    const validRoles = ['user', 'client', 'advisor', 'admin'];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
    }
    // Prevent changing own role
    if (params.id === (session.user as any).id) {
      return NextResponse.json({ error: 'No podés cambiar tu propio rol' }, { status: 400 });
    }
    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
    return NextResponse.json(updated);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Error al actualizar rol' }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id] - delete user (admin only)
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any)?.role !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    if (params.id === (session.user as any).id) {
      return NextResponse.json({ error: 'No podés eliminar tu propia cuenta' }, { status: 400 });
    }
    await prisma.user.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Error al eliminar usuario' }, { status: 500 });
  }
}
