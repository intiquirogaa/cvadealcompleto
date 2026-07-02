import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const constructors = await prisma.constructor.findMany({
      where: { active: true },
      include: { properties: { where: { active: true }, select: { id: true } } },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(constructors);
  } catch (error) {
    console.error('Error fetching constructors:', error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin', 'advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const data = await req.json();
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const constructor = await prisma.constructor.create({
      data: {
        name: data.name,
        slug,
        description: data.description || '',
        styles: data.styles || [],
        customModels: data.customModels ?? false,
        yearsExperience: data.yearsExperience ?? 0,
        guarantee: data.guarantee || '',
        counseling: data.counseling || '',
        logoCloudPath: data.logoCloudPath || null,
        coverCloudPath: data.coverCloudPath || null,
      },
    });
    return NextResponse.json(constructor);
  } catch (error) {
    console.error('Error creating constructor:', error);
    return NextResponse.json({ error: 'Error al crear constructora' }, { status: 500 });
  }
}
