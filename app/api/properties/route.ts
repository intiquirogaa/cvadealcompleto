export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const properties = await prisma.property.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      include: { media: { orderBy: { sortOrder: 'asc' } } },
    });
    return NextResponse.json(properties ?? []);
  } catch (e: any) {
    console.error('Properties fetch error:', e);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const body = await request.json();
    const property = await prisma.property.create({ data: body });
    return NextResponse.json(property);
  } catch (e: any) {
    console.error('Property create error:', e);
    return NextResponse.json({ error: 'Error al crear propiedad' }, { status: 500 });
  }
}
