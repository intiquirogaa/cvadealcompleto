export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const status = searchParams?.get('status');
    const where: any = {};
    if (status && status !== 'all') where.status = status;

    const orders = await prisma.order.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        appointments: { include: { property: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(orders ?? []);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json([], { status: 500 });
  }
}
