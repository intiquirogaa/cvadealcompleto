'use client';
import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  HeadphonesIcon, Calendar, Shield, Clock, MessageCircle,
  Download, Mail, Phone, Award, Star, User, ChevronRight, X, Briefcase, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const S3_BASE = 'https://abacusai-apps-f27519269f5a38e35ae8fccd-us-west-2.s3.us-west-2.amazonaws.com/';
const getUrl = (p: string | null | undefined) => {
  if (!p) return '';
  if (p.startsWith('http')) return p;
  if (p.startsWith('/')) return p;
  return `${S3_BASE}${p}`;
};

interface Advisor {
  id: string;
  bio: string;
  specialty: string;
  profileImageCloudPath: string | null;
  cvCloudPath: string | null;
  yearsExperience: number;
  user: { name: string; email: string; phone: string | null; image: string | null };
}

export function AsesoriaContent({ advisors }: { advisors: Advisor[] }) {
  const { data: session } = useSession() || {};
  const router = useRouter();
  const [selectedAdvisor, setSelectedAdvisor] = useState<Advisor | null>(null);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingAdvisor, setBookingAdvisor] = useState<Advisor | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookingNotes, setBookingNotes] = useState('');

  // Get min date (tomorrow)
  const getMinDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  useEffect(() => {
    if (!selectedDate) return;
    setLoadingSlots(true);
    setSelectedTime('');
    fetch(`/api/appointments/available?date=${selectedDate}`)
      .then(r => r.json())
      .then(d => setAvailableSlots(d?.slots ?? []))
      .catch(() => setAvailableSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [selectedDate]);

  const openBooking = (advisor?: Advisor | null) => {
    if (!session?.user) { router.push('/login'); return; }
    setBookingAdvisor(advisor ?? null);
    setSelectedDate('');
    setSelectedTime('');
    setBookingNotes('');
    setShowBooking(true);
  };

  const handleBook = async () => {
    if (!selectedDate || !selectedTime) { toast.error('Seleccioná fecha y horario'); return; }
    setBooking(true);
    try {
      const res = await fetch('/api/appointments/book-advisory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, time: selectedTime, advisorId: bookingAdvisor?.id || null, notes: bookingNotes }),
      });
      const data = await res.json();
      if (res.ok && data?.initPoint) {
        window.location.href = data.initPoint;
      } else {
        toast.error(data?.error ?? 'Error al procesar la reserva');
      }
    } catch { toast.error('Error de conexión'); }
    finally { setBooking(false); }
  };

  const handleDownloadCV = (cvPath: string | null) => {
    if (!cvPath) return;
    const url = getUrl(cvPath);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'curriculum.pdf';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <main className="flex-1">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-16">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <HeadphonesIcon className="w-8 h-8 text-orange-500" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black mb-4">Asesoría Personalizada</h1>
          <p className="text-muted-foreground">
            Nuestro equipo de expertos te acompaña en cada paso del camino hacia tu nuevo hogar.
            Reservá una consulta sin compromiso.
          </p>
        </div>

        {/* Benefits */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {[
            { icon: Calendar, title: 'Agendá tu cita', desc: 'Elegí el día y horario que te quede cómodo', action: () => openBooking() },
            { icon: MessageCircle, title: 'Consultá sin cargo', desc: 'La primera consulta es sin compromiso' },
            { icon: Shield, title: 'Reserva protegida', desc: 'Tu información y reserva están seguras' },
            { icon: Clock, title: 'Respuesta rápida', desc: 'Te contactamos en menos de 24hs' },
          ].map((v, i) => (
            <div key={i} className={`bg-card border border-border rounded-xl p-6 text-center ${(v as any).action ? 'cursor-pointer hover:border-orange-500/50 transition-colors' : ''}`} onClick={(v as any).action}>
              <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                <v.icon className="w-6 h-6 text-orange-500" />
              </div>
              <h3 className="font-bold mb-1">{v.title}</h3>
              <p className="text-sm text-muted-foreground">{v.desc}</p>
            </div>
          ))}
        </div>

        {/* Advisors section */}
        {advisors.length > 0 && (
          <>
            <div className="text-center mb-10">
              <h2 className="text-2xl font-black mb-2">Nuestro Equipo de Asesores</h2>
              <p className="text-muted-foreground">Profesionales con experiencia en el mercado inmobiliario</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
              {advisors.map((advisor, i) => (
                <motion.div
                  key={advisor.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                    {/* Profile image */}
                    <div className="relative h-48 bg-gradient-to-br from-orange-500/20 to-orange-600/10">
                      {advisor.profileImageCloudPath ? (
                        <Image src={getUrl(advisor.profileImageCloudPath)} alt={advisor.user.name} fill className="object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-24 h-24 rounded-full bg-orange-500/20 flex items-center justify-center">
                            <User className="w-12 h-12 text-orange-500" />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-5">
                      <h3 className="text-lg font-bold">{advisor.user.name}</h3>
                      {advisor.specialty && (
                        <p className="text-sm text-orange-500 font-medium mb-2">{advisor.specialty}</p>
                      )}
                      {advisor.bio && (
                        <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{advisor.bio}</p>
                      )}

                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                        {advisor.yearsExperience > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Award className="w-3.5 h-3.5 text-orange-500" />
                            {advisor.yearsExperience} años exp.
                          </span>
                        )}
                        {advisor.user.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5" />
                            {advisor.user.email}
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedAdvisor(advisor)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white font-medium py-2 rounded-lg transition-colors text-sm"
                        >
                          Ver perfil <ChevronRight className="w-4 h-4" />
                        </button>
                        {advisor.cvCloudPath && (
                          <button
                            onClick={() => handleDownloadCV(advisor.cvCloudPath)}
                            className="inline-flex items-center justify-center gap-1.5 bg-muted hover:bg-muted/80 font-medium px-4 py-2 rounded-lg transition-colors text-sm"
                            title="Descargar CV"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}

        <div className="text-center space-x-4">
          <button
            onClick={() => openBooking()}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-3 rounded-xl transition-colors"
          >
            <Calendar className="w-5 h-5" /> Agendar cita
          </button>
          <Link
            href="/modelos"
            className="inline-flex items-center gap-2 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white font-medium px-8 py-3 rounded-xl transition-colors"
          >
            Explorar modelos
          </Link>
        </div>
      </div>

      {/* Advisor Profile Modal */}
      <AnimatePresence>
        {selectedAdvisor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedAdvisor(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative">
                {/* Cover image */}
                <div className="h-48 bg-gradient-to-br from-orange-500/30 to-orange-600/10 rounded-t-2xl relative">
                  {selectedAdvisor.profileImageCloudPath ? (
                    <Image src={getUrl(selectedAdvisor.profileImageCloudPath)} alt={selectedAdvisor.user.name} fill className="object-cover rounded-t-2xl" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-28 h-28 rounded-full bg-white/20 flex items-center justify-center">
                        <User className="w-14 h-14 text-orange-500" />
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => setSelectedAdvisor(null)}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-6">
                  <h2 className="text-xl font-black">{selectedAdvisor.user.name}</h2>
                  {selectedAdvisor.specialty && (
                    <p className="text-orange-500 font-medium text-sm mb-3">{selectedAdvisor.specialty}</p>
                  )}

                  {/* Stats */}
                  <div className="flex gap-4 mb-4">
                    {selectedAdvisor.yearsExperience > 0 && (
                      <div className="bg-orange-500/10 rounded-lg px-3 py-2 text-center">
                        <p className="text-lg font-bold text-orange-500">{selectedAdvisor.yearsExperience}</p>
                        <p className="text-[10px] text-muted-foreground">Años exp.</p>
                      </div>
                    )}
                  </div>

                  {selectedAdvisor.bio && (
                    <div className="mb-5">
                      <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><Briefcase className="w-4 h-4 text-orange-500" /> Acerca de</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">{selectedAdvisor.bio}</p>
                    </div>
                  )}

                  {/* Contact info */}
                  <div className="space-y-2 mb-5">
                    {selectedAdvisor.user.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <a href={`mailto:${selectedAdvisor.user.email}`} className="text-orange-500 hover:underline">{selectedAdvisor.user.email}</a>
                      </div>
                    )}
                    {selectedAdvisor.user.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <a href={`tel:${selectedAdvisor.user.phone}`} className="text-orange-500 hover:underline">{selectedAdvisor.user.phone}</a>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    {selectedAdvisor.cvCloudPath && (
                      <button
                        onClick={() => handleDownloadCV(selectedAdvisor.cvCloudPath)}
                        className="flex-1 inline-flex items-center justify-center gap-2 border border-border hover:bg-muted font-medium py-2.5 rounded-lg transition-colors text-sm"
                      >
                        <Download className="w-4 h-4" /> Descargar CV
                      </button>
                    )}
                    <button
                      onClick={() => { setSelectedAdvisor(null); openBooking(selectedAdvisor); }}
                      className="flex-1 inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                    >
                      <Calendar className="w-4 h-4" /> Agendar cita
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Booking Modal */}
      <AnimatePresence>
        {showBooking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowBooking(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center p-6 border-b border-border">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2"><Calendar className="w-5 h-5 text-orange-500" /> Agendar Cita</h3>
                  {bookingAdvisor && <p className="text-xs text-muted-foreground mt-1">Con: {bookingAdvisor.user.name}</p>}
                </div>
                <button onClick={() => setShowBooking(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-5">
                {/* Date picker */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Seleccioná una fecha</label>
                  <input
                    type="date"
                    min={getMinDate()}
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>

                {/* Time slots */}
                {selectedDate && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Horario disponible</label>
                    {loadingSlots ? (
                      <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
                    ) : availableSlots.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2">
                        {availableSlots.map(slot => (
                          <button
                            key={slot}
                            onClick={() => setSelectedTime(slot)}
                            className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                              selectedTime === slot
                                ? 'bg-orange-500 text-white border-orange-500'
                                : 'border-border hover:border-orange-500 hover:text-orange-500'
                            }`}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No hay horarios disponibles para esta fecha. Probá con otra fecha.</p>
                    )}
                  </div>
                )}

                {/* Notes */}
                {selectedTime && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Notas (opcional)</label>
                    <textarea
                      value={bookingNotes}
                      onChange={e => setBookingNotes(e.target.value)}
                      placeholder="Contanos brevemente qué necesitás..."
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                )}

                {/* Summary & CTA */}
                {selectedDate && selectedTime && (
                  <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
                    <div className="text-sm space-y-1">
                      <p><span className="text-muted-foreground">Fecha:</span> <strong>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong></p>
                      <p><span className="text-muted-foreground">Horario:</span> <strong>{selectedTime} hs</strong></p>
                      {bookingAdvisor && <p><span className="text-muted-foreground">Asesor:</span> <strong>{bookingAdvisor.user.name}</strong></p>}
                      <p className="text-xs text-muted-foreground mt-2">Precio: ARS $50.000 + IVA</p>
                    </div>
                    <button
                      onClick={handleBook}
                      disabled={booking}
                      className="w-full mt-4 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors"
                    >
                      {booking ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</> : <><Calendar className="w-4 h-4" /> Confirmar y Pagar</>}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
