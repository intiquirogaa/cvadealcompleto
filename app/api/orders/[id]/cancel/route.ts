export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const userId = (session.user as any)?.id;
    const appointment = await prisma.appointment.findFirst({
      where: { id: params?.id },
      include: { order: true },
    });
    if (!appointment || appointment?.order?.userId !== userId) {
      return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
    }
    const scheduledDateTime = new Date(`${appointment.scheduledDate}T${appointment.scheduledTime}:00`);
    const now = new Date();
    const hoursUntil = (scheduledDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntil < 24) {
      return NextResponse.json({ error: 'Solo se puede cancelar con 24 horas de anticipacion' }, { status: 400 });
    }
    await prisma.appointment.update({
      where: { id: params?.id },
      data: { status: 'cancelled' },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Error al cancelar' }, { status: 500 });
  }
}
