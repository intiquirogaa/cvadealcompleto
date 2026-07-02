export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json([], { status: 401 });
    const userId = (session.user as any)?.id;
    const items = await prisma.cartItem.findMany({
      where: { userId },
      include: { property: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(items ?? []);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const userId = (session.user as any)?.id;
    const { propertyId } = await request.json();
    if (!propertyId) return NextResponse.json({ error: 'propertyId requerido' }, { status: 400 });
    const existing = await prisma.cartItem.findUnique({
      where: { userId_propertyId: { userId, propertyId } },
    });
    if (existing) return NextResponse.json({ error: 'Ya esta en el carrito' }, { status: 400 });
    const item = await prisma.cartItem.create({
      data: { userId, propertyId },
      include: { property: true },
    });
    return NextResponse.json(item);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Error al agregar' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const userId = (session.user as any)?.id;
    const { searchParams } = new URL(request.url);
    const itemId = searchParams?.get('id');
    if (!itemId) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
    await prisma.cartItem.deleteMany({ where: { id: itemId, userId } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
  }
}
