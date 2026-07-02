export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'cva_deal_meta_token_2026';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';

// GET /api/webhooks/meta-leads - Webhook verification by Meta
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode && token) {
      if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
        console.log('Meta Webhook verificado correctamente.');
        return new Response(challenge, { status: 200 });
      }
      return NextResponse.json({ error: 'Token de verificación incorrecto' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Parámetros faltantes' }, { status: 400 });
  } catch (e: any) {
    console.error('Error en verificación de webhook:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST /api/webhooks/meta-leads - Receive real-time lead notification
export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('Meta Webhook recibido:', JSON.stringify(body));

    // Meta sends changes inside entry
    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field === 'leadgen') {
          const value = change.value;
          const leadGenId = value.leadgen_id;
          const pageId = value.page_id;
          const formId = value.form_id;

          if (leadGenId) {
            console.log(`Procesando lead gen ID: ${leadGenId} para formulario: ${formId}`);

            // In production, we would fetch fields from Graph API:
            // https://graph.facebook.com/v19.0/{leadgen_id}?access_token={token}
            let leadData = {
              name: 'Cliente Meta',
              email: `meta_${leadGenId}@example.com`,
              phone: '',
              locality: 'Buenos Aires',
              propertiesInterest: ['Casa Premium 140'],
            };

            if (META_ACCESS_TOKEN) {
              try {
                const res = await fetch(
                  `https://graph.facebook.com/v19.0/${leadGenId}?access_token=${META_ACCESS_TOKEN}`
                );
                if (res.ok) {
                  const data = await res.json();
                  // Parse field data from Meta: field_data: [{ name: "email", values: ["..."] }, ...]
                  const fieldData = data.field_data || [];
                  const emailField = fieldData.find((f: any) => f.name === 'email' || f.name === 'your_email');
                  const nameField = fieldData.find((f: any) => f.name === 'full_name' || f.name === 'name' || f.name === 'your_name');
                  const phoneField = fieldData.find((f: any) => f.name === 'phone_number' || f.name === 'phone' || f.name === 'your_phone');
                  const cityField = fieldData.find((f: any) => f.name === 'city' || f.name === 'locality');

                  if (emailField?.values?.[0]) leadData.email = emailField.values[0];
                  if (nameField?.values?.[0]) leadData.name = nameField.values[0];
                  if (phoneField?.values?.[0]) leadData.phone = phoneField.values[0];
                  if (cityField?.values?.[0]) leadData.locality = cityField.values[0];
                }
              } catch (err) {
                console.error('Error al consultar Meta Graph API:', err);
              }
            }

            // Split name into firstName and lastName
            const nameParts = leadData.name.split(' ');
            const firstName = nameParts[0] || 'Meta';
            const lastName = nameParts.slice(1).join(' ') || 'Lead';

            // Create client in CRM database
            const client = await prisma.cRMClient.create({
              data: {
                firstName,
                lastName,
                email: leadData.email,
                phone: leadData.phone,
                locality: leadData.locality,
                propertiesInterest: leadData.propertiesInterest,
                stage: 'new_lead',
                notes: `Lead ingresado automáticamente desde anuncio de Meta (Leadgen ID: ${leadGenId}). Formulario: ${formId}`,
              },
            });
            console.log('Cliente de Meta Ads creado en DB:', client.id);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Error al procesar webhook de Meta:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
