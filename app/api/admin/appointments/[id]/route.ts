export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const body = await req.json();
    const appointment = await prisma.appointment.update({
      where: { id: params?.id },
      data: { status: body?.status ?? 'confirmed' },
    });
    return NextResponse.json(appointment);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}
