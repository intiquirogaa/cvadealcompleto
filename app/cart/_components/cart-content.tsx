'use client';
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ShoppingCart, Trash2, Ruler, Bed, Bath, Calendar, Building2, Shield, HeadphonesIcon, Clock, CheckCircle, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

const S3_BASE = 'https://cdn-bafgh.nitrocdn.com/uEQdiGRjcMKwVIPYQCoAmyhMwHhnanqb/assets/images/optimized/rev-e32adee/www.pinnaclerealestatemarketing.com/wp-content/uploads/2024/12/Aerail-Drone-Media-768x512.png';
const formatARS = (n: number) => `$ ${n.toLocaleString('es-AR')}`;

function getImageUrl(property: any): string {
  if (property?.media?.length > 0) return `${S3_BASE}${property.media[0].cloudStoragePath}`;
  if (property?.images?.length > 0) return property.images[0];
  return '/placeholder-house.jpg';
}

export function CartContent() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated') {
      fetch('/api/cart').then(r => r.json()).then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
    }
  }, [status, router]);

  const removeItem = async (id: string) => {
    try {
      const res = await fetch(`/api/cart?id=${id}`, { method: 'DELETE' });
      if (res.ok) { setItems(items.filter(i => i.id !== id)); toast.success('Eliminado del carrito'); }
    } catch { toast.error('Error al eliminar'); }
  };

  const subtotal = items.reduce((sum, i) => sum + (i.property?.consultingPrice ?? 0), 0);
  const iva = subtotal * 0.21;
  const total = subtotal + iva;

  if (loading) return <main className="flex-1 flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" /></main>;

  return (
    <main className="flex-1">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-2">
          <ShoppingCart className="w-6 h-6 text-orange-500" />
          <h1 className="text-2xl font-black">Mi Carrito</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-8">Revisá los modelos que seleccionaste y continuá con tu reserva.</p>

        {items.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-lg font-medium mb-2">Tu carrito está vacío</p>
            <p className="text-sm text-muted-foreground mb-6">Explorá nuestros modelos y reservá tu asesoría.</p>
            <button onClick={() => router.push('/')} className="bg-orange-500 hover:bg-orange-600 text-white font-medium px-6 py-2.5 rounded-lg transition-colors">
              Explorar modelos
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
            {/* Items */}
            <div className="space-y-4">
              {items.map((item: any, i: number) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex flex-col sm:flex-row bg-card border border-border rounded-xl overflow-hidden"
                >
                  <div className="relative w-full sm:w-56 aspect-[4/3] sm:aspect-auto sm:h-auto bg-muted shrink-0">
                    <Image src={getImageUrl(item.property)} alt={item.property?.address ?? 'Modelo'} fill className="object-cover" />
                    {item.property?.financingStatus && (
                      <span className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">{item.property.financingStatus}</span>
                    )}
                  </div>
                  <div className="flex-1 p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-bold">Tipología {item.property?.address ?? ''}</h3>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <Building2 className="w-3 h-3 text-orange-500" /> {item.property?.constructionCompany ?? ''}
                          </div>
                        </div>
                        <span className="text-xl font-black text-orange-500">{formatARS(item.property?.consultingPrice ?? 0)}</span>
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-3">
                        <span className="inline-flex items-center gap-1"><Ruler className="w-3 h-3" />{item.property?.surface ?? 0} m²<br/><span className="text-[10px]">Superficie</span></span>
                        <span className="inline-flex items-center gap-1"><Bed className="w-3 h-3" />{item.property?.bedrooms ?? 0}<br/><span className="text-[10px]">Dormitorios</span></span>
                        <span className="inline-flex items-center gap-1"><Bath className="w-3 h-3" />{item.property?.bathrooms ?? 0}<br/><span className="text-[10px]">Baños</span></span>
                        <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{item.property?.age ?? 0} años<br/><span className="text-[10px]">Antigüedad</span></span>
                      </div>
                    </div>
                    <div className="flex justify-end mt-3">
                      <button onClick={() => removeItem(item.id)} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-red-500 hover:border-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Protected reservation note */}
              <div className="flex items-center justify-between bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-orange-500" />
                  <div>
                    <div className="text-sm font-semibold">Tu reserva está protegida</div>
                    <div className="text-xs text-muted-foreground">Tu selección quedará guardada y un asesor se comunicará para acompañarte.</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Shield className="w-3.5 h-3.5" /> Reserva 100% segura
                </div>
              </div>
            </div>

            {/* Summary sidebar */}
            <div>
              <div className="bg-card border border-border rounded-xl p-6 sticky top-24">
                <h2 className="text-lg font-bold mb-4">Resumen de tu compra</h2>
                <div className="space-y-3 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal ({items.length} item{items.length > 1 ? 's' : ''})</span>
                    <span>{formatARS(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">IVA (21%)</span>
                    <span>{formatARS(iva)}</span>
                  </div>
                  <div className="border-t border-border pt-3 flex justify-between">
                    <span className="font-bold">Total</span>
                    <span className="text-xl font-black text-orange-500">{formatARS(total)}</span>
                  </div>
                </div>

                <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-orange-500" />
                    <div>
                      <div className="text-sm font-semibold">Asesoría personalizada incluida</div>
                      <div className="text-xs text-muted-foreground">Un experto te contactará para ayudarte en cada paso.</div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => router.push('/checkout')}
                  className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl transition-colors"
                >
                  <CreditCard className="w-5 h-5" /> Proceder al Pago <ArrowRight className="w-4 h-4" />
                </button>
                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mt-2">
                  <Shield className="w-3 h-3" /> Pago seguro y protegido
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Trust badges */}
        {items.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12 border-t border-border pt-8">
            {[
              { icon: HeadphonesIcon, title: 'Asesoría personalizada', sub: 'Te acompañamos en cada paso' },
              { icon: Shield, title: 'Reserva protegida', sub: 'Tu selección está 100% segura' },
              { icon: Calendar, title: 'Sin compromiso', sub: 'Podés cancelar cuando quieras' },
              { icon: Clock, title: 'Respuesta rápida', sub: 'Te contactamos en menos de 24hs' },
            ].map((v, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                  <v.icon className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <div className="text-xs font-semibold">{v.title}</div>
                  <div className="text-[10px] text-muted-foreground">{v.sub}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function CreditCard(props: any) {
  return (
    <svg xmlns="https://i.etsystatic.com/23821301/r/il/2aa624/6082495142/il_300x300.6082495142_c2h5.jpg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>
    </svg>
  );
}
