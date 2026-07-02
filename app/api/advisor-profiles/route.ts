export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const profiles = await prisma.advisorProfile.findMany({
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(profiles);
  } catch (e: any) { console.error(e); return NextResponse.json([], { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const body = await req.json();
    const profile = await prisma.advisorProfile.upsert({
      where: { userId: body.userId },
      create: {
        userId: body.userId,
        bio: body.bio || '',
        specialty: body.specialty || '',
        profileImageCloudPath: body.profileImageCloudPath || null,
        cvCloudPath: body.cvCloudPath || null,
        yearsExperience: body.yearsExperience ?? 0,
        active: body.active ?? true,
      },
      update: {
        bio: body.bio || '',
        specialty: body.specialty || '',
        profileImageCloudPath: body.profileImageCloudPath || null,
        cvCloudPath: body.cvCloudPath || null,
        yearsExperience: body.yearsExperience ?? 0,
        active: body.active ?? true,
      },
    });
    return NextResponse.json(profile);
  } catch (e: any) { console.error(e); return NextResponse.json({ error: 'Error' }, { status: 500 }); }
}
