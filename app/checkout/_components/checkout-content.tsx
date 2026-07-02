'use client';
import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Calendar, Clock, CreditCard, MapPin, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

const formatARS = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 });
const HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

function getNextWeekdays(count: number): string[] {
  const days: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (days.length < count) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) { days.push(d.toISOString().split('T')[0] ?? ''); }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function formatDate(dateStr: string): string {
  try { const d = new Date(dateStr + 'T12:00:00'); return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }); }
  catch { return dateStr; }
}

export function CheckoutContent() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [appointments, setAppointments] = useState<Record<string, { date: string; time: string }>>({});
  const [availableSlots, setAvailableSlots] = useState<Record<string, string[]>>({});
  const days = getNextWeekdays(10);

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status === 'authenticated') fetchCart();
  }, [status]);

  const fetchCart = async () => {
    try { const res = await fetch('/api/cart'); const data = await res.json(); setItems(data ?? []); if ((data?.length ?? 0) === 0) { router.replace('/cart'); } }
    catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchSlots = async (date: string) => {
    if (availableSlots?.[date]) return;
    try { const res = await fetch(`/api/appointments/available?date=${date}`); const data = await res.json(); setAvailableSlots((prev: any) => ({ ...(prev ?? {}), [date]: data?.slots ?? HOURS })); }
    catch { setAvailableSlots((prev: any) => ({ ...(prev ?? {}), [date]: HOURS })); }
  };

  const selectDate = (propertyId: string, date: string) => {
    fetchSlots(date);
    setAppointments((prev: any) => ({ ...(prev ?? {}), [propertyId]: { date, time: '' } }));
  };

  const selectTime = (propertyId: string, time: string) => {
    setAppointments((prev: any) => {
      const current = prev?.[propertyId] ?? {};
      return { ...(prev ?? {}), [propertyId]: { ...(current ?? {}), time } };
    });
  };

  const allScheduled = (items ?? []).every((i: any) => {
    const appt = appointments?.[i?.property?.id ?? ''];
    return appt?.date && appt?.time;
  });

  const handleCheckout = async () => {
    if (!allScheduled) { toast.error('Seleccioná fecha y hora para todas las citas'); return; }
    setProcessing(true);
    try {
      const appointmentData = (items ?? []).map((i: any) => {
        const appt = appointments?.[i?.property?.id ?? ''] ?? {};
        return { propertyId: i?.property?.id ?? '', date: appt?.date ?? '', time: appt?.time ?? '' };
      });
      const res = await fetch('/api/payments/create-preference', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: (items ?? []).map((i: any) => ({ propertyId: i?.property?.id ?? '' })), appointments: appointmentData }),
      });
      const data = await res.json();
      if (res.ok && data?.initPoint) { window.location.href = data.initPoint; }
      else { toast.error(data?.error ?? 'Error al procesar pago'); }
    } catch (e: any) { toast.error('Error de conexión'); }
    finally { setProcessing(false); }
  };

  const subtotal = (items ?? []).reduce((sum: number, i: any) => sum + (i?.property?.consultingPrice ?? 0), 0);
  const tax = subtotal * 0.21;
  const total = subtotal + tax;

  if (status === 'loading' || loading) {
    return <main className="flex-1 flex items-center justify-center py-20"><p className="text-muted-foreground">Cargando...</p></main>;
  }

  return (
    <main className="flex-1">
      <div className="max-w-[1200px] mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-8">
          <CreditCard className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Checkout</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <h2 className="font-semibold text-xl text-foreground">Programá tus citas</h2>
            {(items ?? []).map((item: any, idx: number) => {
              const propId = item?.property?.id ?? '';
              const appt = appointments?.[propId] ?? {};
              const dateSlots = availableSlots?.[appt?.date ?? ''] ?? HOURS;
              return (
                <motion.div key={propId || idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                        <div>
                          <h3 className="font-semibold text-foreground">{item?.property?.address ?? ''}</h3>
                          <p className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> {item?.property?.constructionCompany ?? ''} - {formatARS(item?.property?.consultingPrice ?? 0)}</p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-medium text-foreground flex items-center gap-1 mb-2"><Calendar className="w-4 h-4 text-primary" /> Seleccioná fecha</p>
                          <div className="flex gap-2 flex-wrap">
                            {(days ?? []).map((d: string) => (
                              <Button key={d} variant={appt?.date === d ? 'default' : 'outline'} size="sm"
                                onClick={() => selectDate(propId, d)}
                                className={appt?.date === d ? 'bg-foreground text-background' : 'text-sm'}>
                                {formatDate(d)}
                              </Button>
                            ))}
                          </div>
                        </div>
                        {appt?.date && (
                          <div>
                            <p className="text-sm font-medium text-foreground flex items-center gap-1 mb-2"><Clock className="w-4 h-4 text-primary" /> Seleccioná horario</p>
                            <div className="flex gap-2 flex-wrap">
                              {(dateSlots ?? []).map((h: string) => (
                                <Button key={h} variant={appt?.time === h ? 'default' : 'outline'} size="sm"
                                  onClick={() => selectTime(propId, h)}
                                  className={appt?.time === h ? 'bg-primary text-primary-foreground' : ''}>
                                  {h}
                                </Button>
                              ))}
                              {(dateSlots?.length ?? 0) === 0 && <p className="text-sm text-red-500">No hay horarios disponibles</p>}
                            </div>
                          </div>
                        )}
                        {appt?.date && appt?.time && (
                          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/30 px-3 py-2 rounded-lg">
                            <CheckCircle2 className="w-4 h-4" /> Cita: {formatDate(appt.date)} a las {appt.time}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
          <div>
            <Card className="border-0 shadow-md sticky top-24">
              <CardContent className="p-6 space-y-4">
                <h3 className="font-semibold text-lg text-foreground">Resumen de Pago</h3>
                <div className="space-y-2 text-sm">
                  {(items ?? []).map((i: any) => (
                    <div key={i?.id ?? ''} className="flex justify-between">
                      <span className="text-muted-foreground line-clamp-1 max-w-[60%]">{i?.property?.address ?? ''}</span>
                      <span>{formatARS(i?.property?.consultingPrice ?? 0)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatARS(subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">IVA (21%)</span><span>{formatARS(tax)}</span></div>
                  <div className="border-t pt-2 flex justify-between font-bold text-lg"><span>Total</span><span className="text-primary">{formatARS(total)}</span></div>
                </div>
                <Button onClick={handleCheckout} disabled={!allScheduled || processing} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
                  <CreditCard className="w-4 h-4 mr-2" />
                  {processing ? 'Procesando...' : 'Pagar con Mercado Pago'}
                </Button>
                {!allScheduled && <p className="text-xs text-center text-muted-foreground">Seleccioná fecha y hora para todas las citas</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
