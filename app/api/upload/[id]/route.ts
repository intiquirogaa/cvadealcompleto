export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { deleteFile } from '@/lib/s3';

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const media = await prisma.propertyMedia.findUnique({
      where: { id: params.id },
    });

    if (!media) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
    }

    // Delete from S3
    try {
      await deleteFile(media.cloudStoragePath);
    } catch (e) {
      console.error('Error deleting from S3:', e);
    }

    // Delete from database
    await prisma.propertyMedia.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting media:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
