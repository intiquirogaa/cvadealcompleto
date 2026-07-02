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
    const revs = await prisma.simulatorRevestimiento.findMany({ where, orderBy: [{ sortOrder: 'asc' }] });
    return NextResponse.json(revs);
  } catch (e: any) { console.error(e); return NextResponse.json([], { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const body = await req.json();
    const rev = await prisma.simulatorRevestimiento.create({ data: {
      propertyId: body.propertyId,
      category: body.category || 'paredes',
      name: body.name,
      thumbnailCloudPath: body.thumbnailCloudPath,
      sortOrder: body.sortOrder ?? 0,
    }});
    return NextResponse.json(rev);
  } catch (e: any) { console.error(e); return NextResponse.json({ error: 'Error' }, { status: 500 }); }
}
