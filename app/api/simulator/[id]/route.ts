export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const body = await req.json();
    const combo = await prisma.simulatorCombination.update({ where: { id: params.id }, data: body });
    return NextResponse.json(combo);
  } catch (e: any) { console.error(e); return NextResponse.json({ error: 'Error' }, { status: 500 }); }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    await prisma.simulatorCombination.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) { console.error(e); return NextResponse.json({ error: 'Error' }, { status: 500 }); }
}
