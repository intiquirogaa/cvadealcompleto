export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any).role)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const { userId, stage } = await req.json();
    const result = await prisma.cRMStage.upsert({ where: { userId }, update: { stage }, create: { userId, stage } });
    return NextResponse.json(result);
  } catch (e: any) { console.error(e); return NextResponse.json({ error: 'Error' }, { status: 500 }); }
}
