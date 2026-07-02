export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin', 'advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    
    const body = await req.json();
    const { clients } = body ?? {};
    if (!clients || !Array.isArray(clients)) {
      return NextResponse.json({ error: 'Datos de clientes inválidos' }, { status: 400 });
    }

    const createdClients = [];
    const errors = [];
    const advisorId = (session.user as any)?.id ?? null;

    for (const c of clients) {
      try {
        const { firstName, lastName, email, phone, locality, propertiesInterest, stage, notes } = c;
        if (!firstName || !lastName) {
          errors.push({ client: c, error: 'Nombre y apellido requeridos' });
          continue;
        }
        
        const created = await prisma.cRMClient.create({
          data: {
            firstName: String(firstName).trim(),
            lastName: String(lastName).trim(),
            email: email ? String(email).trim() : '',
            phone: phone ? String(phone).trim() : '',
            locality: locality ? String(locality).trim() : '',
            propertiesInterest: Array.isArray(propertiesInterest) ? propertiesInterest : [],
            stage: stage ?? 'new_lead',
            notes: notes ? String(notes).trim() : '',
            assignedAdvisorId: advisorId,
          }
        });
        createdClients.push(created);
      } catch (e: any) {
        console.error('Error importing row:', e);
        errors.push({ client: c, error: e.message || 'Error en base de datos' });
      }
    }

    return NextResponse.json({
      success: true,
      importedCount: createdClients.length,
      errorsCount: errors.length,
      errors,
      imported: createdClients
    });
  } catch (e: any) {
    console.error('Import endpoint error:', e);
    return NextResponse.json({ error: 'Error del servidor al importar' }, { status: 500 });
  }
}
