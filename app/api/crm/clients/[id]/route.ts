export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { relationshipStageLabel } from '@/lib/crm/relationship-stage';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const client = await prisma.cRMClient.findUnique({ where: { id: params.id } });
    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }
    return NextResponse.json(client);
  } catch (e: any) {
    console.error('CRM client fetch error:', e);
    return NextResponse.json({ error: 'Error al obtener cliente' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const body = await req.json();
    const data: any = {};
    if (body.firstName !== undefined) data.firstName = body.firstName;
    if (body.lastName !== undefined) data.lastName = body.lastName;
    if (body.email !== undefined) data.email = body.email;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.locality !== undefined) data.locality = body.locality;
    if (body.propertiesInterest !== undefined) data.propertiesInterest = body.propertiesInterest;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.stage !== undefined) data.stage = body.stage;
    if (body.relationshipStage !== undefined) data.relationshipStage = body.relationshipStage;
    if (body.nextContactDate !== undefined) data.nextContactDate = body.nextContactDate ? new Date(body.nextContactDate) : null;
    if (body.nextContactNote !== undefined) data.nextContactNote = body.nextContactNote;
    if (body.assignedAdvisorId !== undefined) data.assignedAdvisorId = body.assignedAdvisorId;
    if (body.profession !== undefined) data.profession = body.profession;
    if (body.company !== undefined) data.company = body.company;
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;
    if (body.socialLinks !== undefined) data.socialLinks = typeof body.socialLinks === 'string' ? body.socialLinks : JSON.stringify(body.socialLinks);
    if (body.insights !== undefined) data.insights = typeof body.insights === 'string' ? body.insights : JSON.stringify(body.insights);
    if (body.alerts !== undefined) data.alerts = typeof body.alerts === 'string' ? body.alerts : JSON.stringify(body.alerts);
    if (body.autoEnrichEnabled !== undefined) data.autoEnrichEnabled = !!body.autoEnrichEnabled;
    if (body.autoEnrichIntervalDays !== undefined) data.autoEnrichIntervalDays = body.autoEnrichIntervalDays;
    if (body.conversationText !== undefined) data.conversationText = body.conversationText;
    if (body.conversationSentiment !== undefined) data.conversationSentiment = body.conversationSentiment;
    if (body.conversationAnalysis !== undefined) data.conversationAnalysis = body.conversationAnalysis;
    if (body.suggestedProfileChanges !== undefined) data.suggestedProfileChanges = body.suggestedProfileChanges;

    let previousRelationshipStage: string | undefined;
    if (body.relationshipStage !== undefined) {
      const existing = await prisma.cRMClient.findUnique({
        where: { id: params.id },
        select: { relationshipStage: true },
      });
      previousRelationshipStage = existing?.relationshipStage;
    }

    const client = await prisma.cRMClient.update({
      where: { id: params.id },
      data,
    });

    if (
      body.relationshipStage !== undefined &&
      body.relationshipStage !== previousRelationshipStage
    ) {
      try {
        await prisma.cRMActivityLog.create({
          data: {
            clientId: client.id,
            type: 'relationship_stage_changed',
            title: `Etapa de relación actualizada a "${relationshipStageLabel(body.relationshipStage)}"`,
            description: 'Modificado en el CRM',
          },
        });
      } catch (err) {
        console.warn('Could not log relationship stage change:', err);
      }
    }

    return NextResponse.json(client);
  } catch (e: any) {
    console.error('CRM client update error:', e);
    return NextResponse.json({ error: 'Error al actualizar cliente' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin','advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    await prisma.cRMClient.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('CRM client delete error:', e);
    return NextResponse.json({ error: 'Error al eliminar cliente' }, { status: 500 });
  }
}
