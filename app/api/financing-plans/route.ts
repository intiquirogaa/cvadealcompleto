export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const plans = await prisma.financingPlan.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { installments: 'asc' }],
    });
    return NextResponse.json(plans);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const body = await req.json();
    const plan = await prisma.financingPlan.create({
      data: {
        name: body.name || '',
        installments: Number(body.installments),
        downPaymentPct: Number(body.downPaymentPct),
        monthlyAmount: Number(body.monthlyAmount),
        totalAmount: Number(body.totalAmount),
        interestRate: Number(body.interestRate ?? 0),
        currency: body.currency || 'ARS',
        active: body.active ?? true,
        sortOrder: Number(body.sortOrder ?? 0),
      },
    });
    return NextResponse.json(plan);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}
