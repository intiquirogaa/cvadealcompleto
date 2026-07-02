export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any).role)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const posts = await prisma.blogPost.findMany({ orderBy: { createdAt: 'desc' }, include: { constructorRef: true } });
    return NextResponse.json(posts);
  } catch (e: any) { return NextResponse.json([], { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const body = await req.json();
    const slug = (body.title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
    const post = await prisma.blogPost.create({ data: { ...body, slug } });
    return NextResponse.json(post);
  } catch (e: any) { console.error(e); return NextResponse.json({ error: 'Error' }, { status: 500 }); }
}
