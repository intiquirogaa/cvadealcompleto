export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId');
    const where: any = {};
    if (propertyId) where.propertyId = propertyId;
    const colors = await prisma.simulatorColor.findMany({ where, orderBy: [{ sortOrder: 'asc' }] });
    return NextResponse.json(colors);
  } catch (e: any) { console.error(e); return NextResponse.json([], { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const body = await req.json();
    const color = await prisma.simulatorColor.create({ data: {
      propertyId: body.propertyId,
      type: body.type || 'primary',
      name: body.name || '',
      hexCode: body.hexCode,
      sortOrder: body.sortOrder ?? 0,
    }});
    return NextResponse.json(color);
  } catch (e: any) { console.error(e); return NextResponse.json({ error: 'Error' }, { status: 500 }); }
}
