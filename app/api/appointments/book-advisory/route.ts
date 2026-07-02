export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CVA-${ts}-${rand}`;
}

const ADVISORY_PRICE = 50000; // ARS - precio fijo asesoría general

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const userId = (session.user as any)?.id;
    const body = await request.json();
    const { date, time, advisorId, notes } = body ?? {};

    if (!date || !time) {
      return NextResponse.json({ error: 'Fecha y horario requeridos' }, { status: 400 });
    }

    // Check availability
    const existing = await prisma.appointment.findFirst({
      where: { scheduledDate: date, scheduledTime: time, status: { not: 'cancelled' } },
    });
    if (existing) {
      return NextResponse.json({ error: `El horario ${time} del ${date} ya está reservado` }, { status: 400 });
    }

    const subtotal = ADVISORY_PRICE;
    const tax = subtotal * 0.21;
    const total = subtotal + tax;

    // Create order
    const orderNumber = generateOrderNumber();
    const order = await prisma.order.create({
      data: { userId, orderNumber, subtotal, tax, totalAmount: total, status: 'pending' },
    });

    // Create appointment (no property)
    await prisma.appointment.create({
      data: {
        orderId: order.id,
        scheduledDate: date,
        scheduledTime: time,
        advisorId: advisorId || null,
        notes: notes || '',
        appointmentType: 'advisory',
        status: 'pending',
      },
    });

    // Create MP preference
    const origin = request.headers?.get('origin') ?? request.headers?.get('referer')?.replace(/\/[^/]*$/, '') ?? '';
    const mpItems = [
      { title: 'Asesoría Personalizada CVA DEAL', quantity: 1, unit_price: subtotal, currency_id: 'ARS' },
      { title: 'IVA (21%)', quantity: 1, unit_price: Math.round(tax * 100) / 100, currency_id: 'ARS' },
    ];

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` },
      body: JSON.stringify({
        items: mpItems,
        back_urls: {
          success: `${origin}/success?order=${order.id}`,
          failure: `${origin}/failure?order=${order.id}`,
          pending: `${origin}/success?order=${order.id}&pending=true`,
        },
        auto_return: 'approved',
        external_reference: order.id,
        notification_url: `${origin}/api/payments/webhook`,
        metadata: { order_id: order.id, user_id: userId },
      }),
    });

    const mpData = await mpResponse.json();
    if (!mpResponse.ok) {
      console.error('MP error:', mpData);
      return NextResponse.json({ error: 'Error con el servicio de pagos' }, { status: 500 });
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { mpPreferenceId: mpData?.id ?? '' },
    });

    return NextResponse.json({
      preferenceId: mpData?.id,
      initPoint: mpData?.init_point ?? mpData?.sandbox_init_point,
      orderId: order.id,
      orderNumber,
    });
  } catch (e: any) {
    console.error('Advisory booking error:', e);
    return NextResponse.json({ error: 'Error al procesar la reserva' }, { status: 500 });
  }
}
