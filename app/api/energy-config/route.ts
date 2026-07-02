export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const configs = await prisma.energySimConfig.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    return NextResponse.json(configs);
  } catch (e: any) { console.error(e); return NextResponse.json([], { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin'].includes((session.user as any)?.role ?? '')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const body = await req.json();
    const config = await prisma.energySimConfig.upsert({
      where: { sizeM2: body.sizeM2 },
      create: { sizeM2: body.sizeM2, label: body.label || '', tradCost: body.tradCost, secoCost: body.secoCost, sortOrder: body.sortOrder ?? 0 },
      update: { label: body.label || '', tradCost: body.tradCost, secoCost: body.secoCost, sortOrder: body.sortOrder ?? 0, active: body.active ?? true },
    });
    return NextResponse.json(config);
  } catch (e: any) { console.error(e); return NextResponse.json({ error: 'Error' }, { status: 500 }); }
}
