'use client';
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, LayoutDashboard, Home } from 'lucide-react';
import { motion } from 'framer-motion';

export function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPending = searchParams?.get('pending') === 'true';

  return (
    <main className="flex-1 flex items-center justify-center py-20 px-4">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
        <Card className="max-w-md border-0 shadow-xl text-center">
          <CardContent className="p-8">
            <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${isPending ? 'bg-yellow-100' : 'bg-green-100'}`}>
              <CheckCircle2 className={`w-8 h-8 ${isPending ? 'text-yellow-600' : 'text-green-600'}`} />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {isPending ? 'Pago Pendiente' : '¡Pago Exitoso!'}
            </h1>
            <p className="text-muted-foreground mb-6">
              {isPending
                ? 'Tu pago está siendo procesado. Te notificaremos cuando sea confirmado.'
                : 'Tu reserva ha sido confirmada. Recibirás un email con los detalles de tu cita.'}
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => router.push('/dashboard')} className="bg-primary text-primary-foreground">
                <LayoutDashboard className="w-4 h-4 mr-1" /> Mis Reservas
              </Button>
              <Button variant="outline" onClick={() => router.push('/')}>
                <Home className="w-4 h-4 mr-1" /> Inicio
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}
