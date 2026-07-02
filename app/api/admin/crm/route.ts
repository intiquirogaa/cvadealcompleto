export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any).role)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const clients = await prisma.user.findMany({
      where: { role: 'user' },
      select: {
        id: true, name: true, email: true, phone: true, budget: true, preferredType: true, zoneInterest: true, tags: true, createdAt: true,
        orders: { select: { id: true, orderNumber: true, totalAmount: true, status: true, createdAt: true, appointments: { select: { id: true, scheduledDate: true, scheduledTime: true, status: true, property: { select: { address: true, constructionStyle: true } } } } }, orderBy: { createdAt: 'desc' } },
        crmStages: { select: { stage: true, updatedAt: true } },
        clientNotes: { select: { id: true, content: true, createdAt: true, advisor: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(clients);
  } catch (e: any) { console.error(e); return NextResponse.json([], { status: 500 }); }
}
