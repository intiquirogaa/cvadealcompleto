export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const orders = await prisma.order.findMany({ include: { user: { select: { name: true, email: true, phone: true } }, appointments: { include: { property: { select: { address: true } } } } }, orderBy: { createdAt: 'desc' } });
    const header = 'N\u00famero Pedido,Cliente,Email,Tel\u00e9fono,Total,Estado,Fecha,Propiedades,Fechas Cita\n';
    const rows = orders.map(o => {
      const props = o.appointments.map(a => a.property?.address ?? 'Asesoría General').join(' | ');
      const dates = o.appointments.map(a => `${a.scheduledDate} ${a.scheduledTime}`).join(' | ');
      return `${o.orderNumber},"${o.user.name}",${o.user.email},${o.user.phone ?? ''},${o.totalAmount},${o.status},${o.createdAt.toISOString().split('T')[0]},"${props}","${dates}"`;
    }).join('\n');
    const csv = header + rows;
    return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=pedidos-cvadeal.csv' } });
  } catch (e: any) { console.error(e); return NextResponse.json({ error: 'Error' }, { status: 500 }); }
}
