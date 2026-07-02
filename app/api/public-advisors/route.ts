export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const profiles = await prisma.advisorProfile.findMany({
      where: { active: true },
      include: { user: { select: { name: true, email: true, phone: true, image: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(profiles);
  } catch (e: any) { console.error(e); return NextResponse.json([], { status: 500 }); }
}
