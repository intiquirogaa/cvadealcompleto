export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getFileUrl } from '@/lib/s3';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { propertyId, cloudStoragePath, fileName, fileType, fileSize, mediaType } = body;

    if (!propertyId || !cloudStoragePath || !fileName || !fileType || !mediaType) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    // Get max sort order for this property
    const maxOrder = await prisma.propertyMedia.findFirst({
      where: { propertyId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const media = await prisma.propertyMedia.create({
      data: {
        propertyId,
        cloudStoragePath,
        fileName,
        fileType,
        fileSize: fileSize ?? 0,
        mediaType,
        isPublic: true,
        sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
      },
    });

    // Get public URL
    const url = await getFileUrl(cloudStoragePath, true);

    return NextResponse.json({ ...media, url });
  } catch (error: any) {
    console.error('Error completing upload:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
