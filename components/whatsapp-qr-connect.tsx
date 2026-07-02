'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, RefreshCw, CheckCircle, XCircle, Smartphone } from 'lucide-react';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'qr';

interface WhatsAppQRConnectProps {
  onConnected?: () => void;
}

export function WhatsAppQRConnect({ onConnected }: WhatsAppQRConnectProps) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = async () => {
    try {
      const response = await fetch('/api/whatsapp/connect');
      const data = await response.json();
      setStatus(data.status);
      setQrCode(data.qrCode);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const connect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect' }),
      });
      const data = await response.json();
      setStatus(data.status);
      setQrCode(data.qrCode ?? null);

      if (data.status === 'connected') {
        onConnected?.();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const disconnect = async () => {
    setIsLoading(true);
    try {
      await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      setStatus('disconnected');
      setQrCode(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const clearSession = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
      setStatus('disconnected');
      setQrCode(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();

    const eventSource = new EventSource('/api/whatsapp/events');
    eventSource.addEventListener('state', (event) => {
      const payload = JSON.parse(event.data);
      setStatus(payload.state);
      setQrCode(payload.qrCode ?? null);
      setIsLoading(false);

      if (payload.state === 'connected') {
        onConnected?.();
      }
    });

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          Conectar WhatsApp
        </CardTitle>
        <CardDescription>
          Escanea el código QR para conectar tu WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            {error}
          </div>
        )}

        {status === 'disconnected' && (
          <div className="text-center py-8">
            <XCircle className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              WhatsApp no está conectado
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={connect} disabled={isLoading} className="w-full">
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Conectar
                  </>
                )}
              </Button>
              <Button 
                onClick={clearSession} 
                disabled={isLoading} 
                variant="outline" 
                className="w-full text-sm"
              >
                Limpiar sesión y reintentar
              </Button>
            </div>
          </div>
        )}

        {status === 'connecting' && !qrCode && (
          <div className="text-center py-8">
            <Loader2 className="w-16 h-16 mx-auto animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">
              Generando código QR...
            </p>
          </div>
        )}

        {status === 'qr' && qrCode && (
          <div className="text-center space-y-4">
            <div className="bg-white p-4 rounded-lg inline-block">
              <QRCodeSVG value={qrCode} size={200} />
            </div>
            <p className="text-sm text-muted-foreground">
              1. Abre WhatsApp en tu teléfono
              <br />
              2. Ve a Menú → Dispositivos vinculados
              <br />
              3. Escanea este código QR
            </p>
            <Button onClick={disconnect} variant="outline" className="w-full">
              Cancelar
            </Button>
          </div>
        )}

        {status === 'connected' && (
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
            <p className="text-green-600 font-medium mb-4">
              ¡Conectado exitosamente!
            </p>
            <Button onClick={disconnect} variant="destructive" className="w-full">
              Desconectar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
