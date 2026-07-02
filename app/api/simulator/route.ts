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
    const combos = await prisma.simulatorCombination.findMany({
      where,
      include: { property: { select: { id: true, address: true, constructionStyle: true, images: true, bedrooms: true, bathrooms: true, surface: true, media: { take: 1, orderBy: { sortOrder: 'asc' } } } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json(combos);
  } catch (e: any) { console.error(e); return NextResponse.json([], { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const body = await req.json();
    const combo = await prisma.simulatorCombination.create({ data: {
      propertyId: body.propertyId,
      name: body.name || '',
      style: body.style || '',
      viewType: body.viewType || 'exterior',
      imageCloudPath: body.imageCloudPath,
      colorPrimary: body.colorPrimary || '',
      colorSecondary: body.colorSecondary || '',
      revestimiento: body.revestimiento || '',
      revestimientoCategory: body.revestimientoCategory || 'paredes',
      isRecommended: body.isRecommended ?? false,
      sortOrder: body.sortOrder ?? 0,
    }});
    return NextResponse.json(combo);
  } catch (e: any) { console.error(e); return NextResponse.json({ error: 'Error' }, { status: 500 }); }
}
