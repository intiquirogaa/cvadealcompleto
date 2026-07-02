export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Debe iniciar sesi\u00f3n' }, { status: 401 });
    const posts = await prisma.blogPost.findMany({ where: { published: true }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json(posts);
  } catch (e: any) { console.error(e); return NextResponse.json([], { status: 500 }); }
}
