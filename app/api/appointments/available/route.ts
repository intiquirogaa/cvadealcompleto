export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams?.get('date');
    if (!date) return NextResponse.json({ slots: HOURS });
    const booked = await prisma.appointment.findMany({
      where: { scheduledDate: date, status: { not: 'cancelled' } },
      select: { scheduledTime: true },
    });
    const bookedTimes = (booked ?? []).map((a: any) => a?.scheduledTime);
    const available = HOURS.filter((h: string) => !bookedTimes.includes(h));
    return NextResponse.json({ slots: available });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ slots: HOURS });
  }
}
