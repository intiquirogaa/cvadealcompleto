import { NextResponse } from 'next/server';
import { whatsappService } from '@/lib/whatsapp/service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const handleStateChange = (state: string) => {
        sendEvent('state', {
          state,
          connected: whatsappService.isConnected(),
          qrCode: whatsappService.getQRCode(),
        });
      };

      const handleMessage = (message: unknown) => {
        sendEvent('message', message);
      };

      const unsubscribeState = whatsappService.onConnectionStateChange(handleStateChange);
      const unsubscribeMessage = whatsappService.onMessage(handleMessage);

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(': ping\n\n'));
      }, 15000);

      const cleanup = () => {
        clearInterval(keepAlive);
        unsubscribeState();
        unsubscribeMessage();
      };

      if (request.signal.aborted) {
        cleanup();
        controller.close();
        return;
      }

      request.signal.addEventListener('abort', () => {
        cleanup();
        controller.close();
      }, { once: true });

      handleStateChange(whatsappService.getConnectionState());
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
