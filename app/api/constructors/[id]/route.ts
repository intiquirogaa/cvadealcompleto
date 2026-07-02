import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const constructor = await prisma.constructor.findUnique({
      where: { id: params.id },
      include: {
        properties: {
          where: { active: true },
          include: { media: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!constructor) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    return NextResponse.json(constructor);
  } catch (error) {
    console.error('Error fetching constructor:', error);
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin', 'advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const data = await req.json();
    const constructor = await prisma.constructor.update({
      where: { id: params.id },
      data: {
        name: data.name,
        description: data.description,
        styles: data.styles,
        customModels: data.customModels,
        yearsExperience: data.yearsExperience,
        guarantee: data.guarantee,
        counseling: data.counseling,
        logoCloudPath: data.logoCloudPath,
        coverCloudPath: data.coverCloudPath,
      },
    });
    return NextResponse.json(constructor);
  } catch (error) {
    console.error('Error updating constructor:', error);
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin', 'advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    await prisma.constructor.update({ where: { id: params.id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting constructor:', error);
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
  }
}
