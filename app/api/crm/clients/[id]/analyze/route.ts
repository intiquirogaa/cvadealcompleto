export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !['admin', 'advisor'].includes((session.user as any)?.role ?? '')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { conversationText } = body ?? {};
    if (!conversationText || typeof conversationText !== 'string') {
      return NextResponse.json({ error: 'Transcripción de conversación requerida' }, { status: 400 });
    }

    // 1. Fetch current client to check differences
    const client = await prisma.cRMClient.findUnique({ where: { id: params.id } });
    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // 2. Perform simulated AI NLP analysis
    const textLower = conversationText.toLowerCase();

    // Sentiment analysis logic
    let sentiment = 'Neutral - 60% (Diálogo informativo)';
    if (textLower.includes('encanta') || textLower.includes('comprar ya') || textLower.includes('excelente') || textLower.includes('buenísimo') || textLower.includes('avanzar')) {
      sentiment = 'Positivo - 90% (Lead muy interesado en concretar)';
    } else if (textLower.includes('caro') || textLower.includes('complicado') || textLower.includes('retraso') || textLower.includes('duda') || textLower.includes('problema')) {
      sentiment = 'Preocupado / Negativo - 45% (Objeciones financieras o de tiempo)';
    }

    // Recommendations logic
    const recommendations = [
      'Enfocar el discurso de venta en el ahorro energético que ofrece el sistema de steel framing.',
      'Sugerir una visita coordinada al showroom para disipar dudas sobre terminaciones.',
      'Priorizar el seguimiento por WhatsApp de forma amigable sin presionar.'
    ];

    if (textLower.includes('presupuesto') || textLower.includes('dinero') || textLower.includes('precio')) {
      recommendations.unshift('Enviar simulación detallada de plan de cuotas y financiación directa.');
    }
    if (textLower.includes('steel') || textLower.includes('construccion') || textLower.includes('obra')) {
      recommendations.unshift('Destacar que las propiedades de CVA se entregan listas para habitar en 45 días.');
    }

    // Suggested changes detection
    const suggestedChanges = [];

    // Detect profession
    if (textLower.includes('soy médico') || textLower.includes('trabajo de médico') || textLower.includes('clinica')) {
      if (client.profession !== 'Médico') {
        suggestedChanges.push({ field: 'profession', label: 'Profesión', current: client.profession || 'Sin especificar', suggested: 'Médico' });
      }
    } else if (textLower.includes('arquitecto') || textLower.includes('construyo') || textLower.includes('diseño')) {
      if (client.profession !== 'Arquitecto') {
        suggestedChanges.push({ field: 'profession', label: 'Profesión', current: client.profession || 'Sin especificar', suggested: 'Arquitecto' });
      }
    } else if (textLower.includes('ingeniero') || textLower.includes('sistemas') || textLower.includes('programador')) {
      if (client.profession !== 'Ingeniero de Software') {
        suggestedChanges.push({ field: 'profession', label: 'Profesión', current: client.profession || 'Sin especificar', suggested: 'Ingeniero de Software' });
      }
    }

    // Detect company
    if (textLower.includes('techint') || textLower.includes('empresa techint')) {
      if (client.company !== 'Techint') {
        suggestedChanges.push({ field: 'company', label: 'Empresa', current: client.company || 'Sin especificar', suggested: 'Techint' });
      }
    } else if (textLower.includes('mercado libre') || textLower.includes('mercadolibre')) {
      if (client.company !== 'Mercado Libre') {
        suggestedChanges.push({ field: 'company', label: 'Empresa', current: client.company || 'Sin especificar', suggested: 'Mercado Libre' });
      }
    }

    // Detect locality
    if (textLower.includes('palermo') || textLower.includes('capital federal')) {
      if (client.locality !== 'Palermo, CABA') {
        suggestedChanges.push({ field: 'locality', label: 'Ubicación', current: client.locality || 'Sin especificar', suggested: 'Palermo, CABA' });
      }
    } else if (textLower.includes('pilar') || textLower.includes('nordelta')) {
      if (client.locality !== 'Nordelta, Tigre') {
        suggestedChanges.push({ field: 'locality', label: 'Ubicación', current: client.locality || 'Sin especificar', suggested: 'Nordelta, Tigre' });
      }
    }

    // Detect interests (Prisma property interests)
    if (textLower.includes('casa') || textLower.includes('duplex')) {
      const suggestedInterests = ['Duplex', 'Casa de Estilo'];
      const hasDiff = suggestedInterests.some(i => !client.propertiesInterest.includes(i));
      if (hasDiff) {
        suggestedChanges.push({
          field: 'propertiesInterest',
          label: 'Intereses',
          current: client.propertiesInterest.join(', ') || 'Ninguno',
          suggested: suggestedInterests.join(', '),
          rawData: suggestedInterests
        });
      }
    }

    // 3. Update DB
    const updatedClient = await prisma.cRMClient.update({
      where: { id: params.id },
      data: {
        conversationText,
        conversationSentiment: sentiment,
        conversationAnalysis: JSON.stringify(recommendations),
        suggestedProfileChanges: JSON.stringify(suggestedChanges),
      }
    });

    return NextResponse.json(updatedClient);
  } catch (e: any) {
    console.error('Chat analysis error:', e);
    return NextResponse.json({ error: 'Error al procesar análisis' }, { status: 500 });
  }
}
