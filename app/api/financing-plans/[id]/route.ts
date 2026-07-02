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
    const plan = await prisma.financingPlan.update({
      where: { id: params.id },
      data: {
        name: body.name,
        installments: body.installments !== undefined ? Number(body.installments) : undefined,
        downPaymentPct: body.downPaymentPct !== undefined ? Number(body.downPaymentPct) : undefined,
        monthlyAmount: body.monthlyAmount !== undefined ? Number(body.monthlyAmount) : undefined,
        totalAmount: body.totalAmount !== undefined ? Number(body.totalAmount) : undefined,
        interestRate: body.interestRate !== undefined ? Number(body.interestRate) : undefined,
        active: body.active,
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
      },
    });
    return NextResponse.json(plan);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    await prisma.financingPlan.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}
