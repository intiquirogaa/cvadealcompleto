'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { XCircle, ShoppingCart, Home } from 'lucide-react';
import { motion } from 'framer-motion';

export function FailureContent() {
  const router = useRouter();

  return (
    <main className="flex-1 flex items-center justify-center py-20 px-4">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
        <Card className="max-w-md border-0 shadow-xl text-center">
          <CardContent className="p-8">
            <div className="w-16 h-16 rounded-full bg-red-100 mx-auto mb-4 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Pago No Completado</h1>
            <p className="text-muted-foreground mb-6">
              Hubo un problema con tu pago. No se realizó ningún cargo. Podés intentar nuevamente.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => router.push('/cart')} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <ShoppingCart className="w-4 h-4 mr-1" /> Reintentar
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
