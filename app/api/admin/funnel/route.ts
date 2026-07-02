export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const [totalUsers, totalOrders, approvedOrders, completedAppointments, totalProperties] = await Promise.all([
      prisma.user.count({ where: { role: 'user' } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'approved' } }),
      prisma.appointment.count({ where: { status: 'completed' } }),
      prisma.property.count({ where: { active: true } }),
    ]);
    const cartItems = await prisma.cartItem.count();
    return NextResponse.json({ totalUsers, cartItems, totalOrders, approvedOrders, completedAppointments, totalProperties });
  } catch (e: any) { console.error(e); return NextResponse.json({ error: 'Error' }, { status: 500 }); }
}
