export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const userId = (session.user as any).id;
    const url = new URL(req.url);
    const propertyId = url.searchParams.get('propertyId');
    if (propertyId) {
      const fav = await prisma.favorite.findUnique({ where: { userId_propertyId: { userId, propertyId } } });
      return NextResponse.json({ isFavorite: !!fav });
    }
    const favorites = await prisma.favorite.findMany({ where: { userId }, include: { property: { include: { media: { orderBy: { sortOrder: 'asc' } } } } }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json(favorites);
  } catch (e: any) { console.error(e); return NextResponse.json([], { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const { propertyId } = await req.json();
    const userId = (session.user as any).id;
    const fav = await prisma.favorite.create({ data: { userId, propertyId } });
    return NextResponse.json(fav);
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Ya est\u00e1 en favoritos' }, { status: 400 });
    console.error(e); return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const { propertyId } = await req.json();
    const userId = (session.user as any).id;
    await prisma.favorite.deleteMany({ where: { userId, propertyId } });
    return NextResponse.json({ success: true });
  } catch (e: any) { console.error(e); return NextResponse.json({ error: 'Error' }, { status: 500 }); }
}
