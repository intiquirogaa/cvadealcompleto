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

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const userId = (session.user as any)?.id;
    const body = await request.json();
    const { items, appointments: appointmentData } = body ?? {};
    if (!items?.length) return NextResponse.json({ error: 'Carrito vacio' }, { status: 400 });

    // Validate appointments
    for (const appt of (appointmentData ?? [])) {
      if (!appt?.date || !appt?.time) {
        return NextResponse.json({ error: 'Datos de cita incompletos' }, { status: 400 });
      }
      const existing = await prisma.appointment.findFirst({
        where: { scheduledDate: appt.date, scheduledTime: appt.time, status: { not: 'cancelled' } },
      });
      if (existing) {
        return NextResponse.json({ error: `Horario ${appt.time} del ${appt.date} ya reservado` }, { status: 400 });
      }
    }

    // Calculate totals
    const propertyIds = (items ?? []).map((i: any) => i?.propertyId);
    const properties = await prisma.property.findMany({ where: { id: { in: propertyIds } } });
    const subtotal = (properties ?? []).reduce((sum: number, p: any) => sum + (p?.consultingPrice ?? 0), 0);
    const tax = subtotal * 0.21;
    const total = subtotal + tax;

    // Create order
    const orderNumber = generateOrderNumber();
    const order = await prisma.order.create({
      data: {
        userId,
        orderNumber,
        subtotal,
        tax,
        totalAmount: total,
        status: 'pending',
      },
    });

    // Create appointments
    for (const appt of (appointmentData ?? [])) {
      await prisma.appointment.create({
        data: {
          orderId: order.id,
          propertyId: appt.propertyId || null,
          scheduledDate: appt.date,
          scheduledTime: appt.time,
          status: 'pending',
          appointmentType: appt.propertyId ? 'property' : 'advisory',
        },
      });
    }

    // Create MP preference
    const origin = request.headers?.get('origin') ?? request.headers?.get('referer')?.replace(/\/[^/]*$/, '') ?? '';
    const mpItems = (properties ?? []).map((p: any) => ({
      title: `Asesoramiento - ${p?.address ?? 'Propiedad'}`,
      quantity: 1,
      unit_price: p?.consultingPrice ?? 0,
      currency_id: 'ARS',
    }));
    // Add tax item
    mpItems.push({
      title: 'IVA (21%)',
      quantity: 1,
      unit_price: Math.round(tax * 100) / 100,
      currency_id: 'ARS',
    });

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
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
      return NextResponse.json({ error: 'Error con Mercado Pago' }, { status: 500 });
    }

    // Update order with MP preference
    await prisma.order.update({
      where: { id: order.id },
      data: { mpPreferenceId: mpData?.id ?? '' },
    });

    // Clear cart
    await prisma.cartItem.deleteMany({ where: { userId } });

    return NextResponse.json({
      preferenceId: mpData?.id,
      initPoint: mpData?.init_point ?? mpData?.sandbox_init_point,
      orderId: order.id,
      orderNumber,
    });
  } catch (e: any) {
    console.error('Payment error:', e);
    return NextResponse.json({ error: 'Error al procesar pago' }, { status: 500 });
  }
}
