export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.property.update({ where: { id: params.id }, data: { viewCount: { increment: 1 } } });
    return NextResponse.json({ ok: true });
  } catch (e: any) { return NextResponse.json({ ok: false }); }
}
