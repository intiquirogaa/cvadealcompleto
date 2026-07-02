export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [totalOrders, approvedOrders, pendingAppointments, totalRevenue, totalUsers, totalProperties,
      ordersThisMonth, ordersLastMonth, revenueThisMonth, revenueLastMonth, usersThisMonth, usersLastMonth,
      upcomingAppointments, recentOrders, totalClients, clientsThisMonth
    ] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: 'approved' } }),
      prisma.appointment.count({ where: { status: { in: ['pending', 'confirmed'] } } }),
      prisma.order.aggregate({ where: { status: 'approved' }, _sum: { totalAmount: true } }),
      prisma.user.count({ where: { role: 'user' } }),
      prisma.property.count({ where: { active: true } }),
      // Monthly comparisons
      prisma.order.count({ where: { createdAt: { gte: thisMonthStart } } }),
      prisma.order.count({ where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
      prisma.order.aggregate({ where: { status: 'approved', createdAt: { gte: thisMonthStart } }, _sum: { totalAmount: true } }),
      prisma.order.aggregate({ where: { status: 'approved', createdAt: { gte: lastMonthStart, lte: lastMonthEnd } }, _sum: { totalAmount: true } }),
      prisma.user.count({ where: { role: 'user', createdAt: { gte: thisMonthStart } } }),
      prisma.user.count({ where: { role: 'user', createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
      // Upcoming appointments
      prisma.appointment.findMany({
        where: { scheduledDate: { gte: now.toISOString().split('T')[0] }, status: { in: ['pending', 'confirmed'] } },
        include: { property: { select: { address: true } }, advisor: { select: { name: true } }, order: { include: { user: { select: { name: true, email: true } } } } },
        orderBy: { scheduledDate: 'asc' },
        take: 5,
      }),
      // Recent orders
      prisma.order.findMany({
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      // CRM clients count
      prisma.cRMClient.count(),
      prisma.cRMClient.count({ where: { createdAt: { gte: thisMonthStart } } }),
    ]);

    const calcVariation = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    return NextResponse.json({
      totalOrders,
      approvedOrders,
      pendingAppointments,
      totalRevenue: totalRevenue?._sum?.totalAmount ?? 0,
      totalUsers,
      totalProperties,
      totalClients,
      // Monthly variations
      ordersVariation: calcVariation(ordersThisMonth, ordersLastMonth),
      revenueVariation: calcVariation(
        Number(revenueThisMonth?._sum?.totalAmount ?? 0),
        Number(revenueLastMonth?._sum?.totalAmount ?? 0)
      ),
      usersVariation: calcVariation(usersThisMonth, usersLastMonth),
      clientsVariation: calcVariation(clientsThisMonth, totalClients - clientsThisMonth),
      // Upcoming & recent
      upcomingAppointments: upcomingAppointments.map((a: any) => ({
        id: a.id,
        date: a.scheduledDate,
        time: a.scheduledTime,
        property: a.property?.address,
        advisor: a.advisor?.name,
        client: a.order?.user?.name,
        status: a.status,
      })),
      recentOrders: recentOrders.map((o: any) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        amount: o.totalAmount,
        status: o.status,
        client: o.user?.name,
        date: o.createdAt,
      })),
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({}, { status: 500 });
  }
}
