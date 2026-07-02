export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json([], { status: 401 });
    const userId = (session.user as any)?.id;
    const orders = await prisma.order.findMany({
      where: { userId },
      include: { appointments: { include: { property: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(orders ?? []);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json([], { status: 500 });
  }
}
