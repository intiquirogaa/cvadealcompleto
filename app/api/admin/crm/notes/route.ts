export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any).role)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const { clientId, content } = await req.json();
    const advisorId = (session.user as any).id;
    const note = await prisma.clientNote.create({ data: { clientId, advisorId, content } });
    return NextResponse.json(note);
  } catch (e: any) { console.error(e); return NextResponse.json({ error: 'Error' }, { status: 500 }); }
}
