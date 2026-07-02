export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const section = searchParams.get('section');
    const where: any = {};
    if (section) where.section = section;
    const popups = await prisma.statsPopup.findMany({ where, orderBy: { sortOrder: 'asc' } });
    return NextResponse.json(popups);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !['admin', 'advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const body = await req.json();
    const popup = await prisma.statsPopup.upsert({
      where: { section_statKey: { section: body.section, statKey: body.statKey } },
      update: { title: body.title, content: body.content, value: body.value, label: body.label, active: body.active ?? true, sortOrder: body.sortOrder ?? 0 },
      create: { section: body.section, statKey: body.statKey, title: body.title ?? '', content: body.content ?? '', value: body.value ?? '', label: body.label ?? '', active: body.active ?? true, sortOrder: body.sortOrder ?? 0 },
    });
    return NextResponse.json(popup);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
