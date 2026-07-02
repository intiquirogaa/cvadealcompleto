export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

async function sendNotification(notifId: string, subject: string, body: string, recipientEmail: string, replyTo?: string) {
  try {
    const appUrl = process.env.NEXTAUTH_URL ?? '';
    let appName = 'CVA Deal';
    try { appName = new URL(appUrl).hostname?.split('.')[0] ?? 'CVA Deal'; } catch {}
    await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        app_id: process.env.WEB_APP_ID,
        notification_id: notifId,
        subject,
        body,
        is_html: true,
        recipient_email: recipientEmail,
        reply_to: replyTo ?? undefined,
        sender_email: `noreply@${(() => { try { return new URL(appUrl).hostname; } catch { return 'mail.abacusai.app'; } })()}`,
        sender_alias: 'CVA Deal',
      }),
    });
  } catch (e: any) {
    console.error('Notification error:', e);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, data } = body ?? {};
    if (type === 'payment' && data?.id) {
      const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` },
      });
      const payment = await paymentRes.json();
      const orderId = payment?.external_reference;
      if (!orderId) return NextResponse.json({ ok: true });

      let status = 'pending';
      if (payment?.status === 'approved') status = 'approved';
      else if (payment?.status === 'rejected') status = 'rejected';

      await prisma.order.update({
        where: { id: orderId },
        data: { status, mpPaymentId: String(data.id) },
      });

      if (status === 'approved') {
        await prisma.appointment.updateMany({
          where: { orderId },
          data: { status: 'confirmed' },
        });

        // Send notifications
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: { user: true, appointments: { include: { property: true } } },
        });

        if (order) {
          const appointmentsList = (order.appointments ?? []).map((a: any) =>
            `<li>${a?.property?.address ?? 'Propiedad'} - ${a?.scheduledDate ?? ''} a las ${a?.scheduledTime ?? ''}</li>`
          ).join('');

          // Client notification
          const clientHtml = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
              <h2 style="color:#1a2332;border-bottom:3px solid #d4a843;padding-bottom:10px">Reserva Confirmada - CVA Deal</h2>
              <p>Hola ${order?.user?.name ?? 'Cliente'},</p>
              <p>Tu pago ha sido aprobado. Aqui estan los detalles de tus citas:</p>
              <div style="background:#f9fafb;padding:20px;border-radius:8px;margin:15px 0">
                <p><strong>Orden:</strong> ${order?.orderNumber ?? ''}</p>
                <p><strong>Total:</strong> $${order?.totalAmount?.toFixed?.(2) ?? '0'}</p>
                <p><strong>Citas programadas:</strong></p>
                <ul>${appointmentsList}</ul>
              </div>
              <p style="color:#666;font-size:12px">Gracias por confiar en CVA Deal.</p>
            </div>`;
          await sendNotification(
            process.env.NOTIF_ID_CONFIRMACIN_DE_RESERVA ?? '',
            `Reserva Confirmada - Orden ${order?.orderNumber ?? ''}`,
            clientHtml,
            order?.user?.email ?? ''
          );

          // Admin notification
          const adminHtml = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
              <h2 style="color:#1a2332;border-bottom:3px solid #d4a843;padding-bottom:10px">Nueva Reserva - CVA Deal</h2>
              <div style="background:#f9fafb;padding:20px;border-radius:8px;margin:15px 0">
                <p><strong>Cliente:</strong> ${order?.user?.name ?? ''} (${order?.user?.email ?? ''})</p>
                <p><strong>Telefono:</strong> ${order?.user?.phone ?? 'No proporcionado'}</p>
                <p><strong>Orden:</strong> ${order?.orderNumber ?? ''}</p>
                <p><strong>Total:</strong> $${order?.totalAmount?.toFixed?.(2) ?? '0'}</p>
                <p><strong>Citas:</strong></p>
                <ul>${appointmentsList}</ul>
              </div>
            </div>`;
          await sendNotification(
            process.env.NOTIF_ID_NUEVA_RESERVA_ADMIN ?? '',
            `Nueva Reserva - ${order?.user?.name ?? 'Cliente'} - ${order?.orderNumber ?? ''}`,
            adminHtml,
            'cvalearning@gmail.com',
            order?.user?.email ?? undefined
          );
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Webhook error:', e);
    return NextResponse.json({ ok: true });
  }
}
