'use client';
import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Video, Building2, Heart, Ruler, Bed, Bath, Calendar, ShoppingCart, Shield, Clock, HeadphonesIcon, CreditCard, ChevronDown, ChevronUp, MapPin, FileImage, X, Banknote } from 'lucide-react';
import { motion } from 'framer-motion';

const S3_BASE = 'https://abacusai-apps-f27519269f5a38e35ae8fccd-us-west-2.s3.us-west-2.amazonaws.com/';
const formatARS = (n: number) => `ARS $${n.toLocaleString('es-AR')}`;

function getMediaUrl(media: any) {
  return S3_BASE + media.cloudStoragePath;
}

const TABS = ['Descripción', 'Planos', 'Características', 'Ubicación', 'Preguntas frecuentes'];

export function PropertyDetail({ property }: { property: any }) {
  const { data: session } = useSession() || {};
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFav, setIsFav] = useState(false);
  const [activeTab, setActiveTab] = useState('Descripción');
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showFinancingModal, setShowFinancingModal] = useState(false);
  const [financingPlans, setFinancingPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Parse FAQ from DB
  const faqItems = useMemo(() => {
    try {
      const parsed = JSON.parse(property?.faqJson || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
    return [
      { q: '¿Qué incluye la asesoría?', a: 'Incluye una consulta personalizada con un experto en construcción en seco, análisis de tu terreno y necesidades, y un plan de financiación a medida.' },
      { q: '¿Puedo cancelar la reserva?', a: 'Sí, podés cancelar hasta 24 horas antes de la entrevista sin cargo.' },
      { q: '¿Cuánto tiempo tarda la construcción?', a: 'El tiempo estimado de entrega es de 45 días hábiles desde la firma del contrato.' },
    ];
  }, [property?.faqJson]);

  const deliveryDays = property?.deliveryTimeDays ?? 45;
  const deliveryNote = property?.deliveryTimeNote || 'Desde la reserva';
  const financingSim = property?.financingSimDetail || '';

  const galleryItems = useMemo(() => {
    const items: { type: 'image' | 'video'; src: string; alt: string }[] = [];
    if (property?.media?.length > 0) {
      for (const m of property.media) {
        items.push({ type: m.mediaType === 'video' ? 'video' : 'image', src: getMediaUrl(m), alt: m.fileName ?? 'Media' });
      }
    }
    if (property?.images?.length > 0) {
      for (const url of property.images) {
        if (url && typeof url === 'string') items.push({ type: 'image', src: url, alt: property?.address ?? 'Propiedad' });
      }
    }
    // Deduplicate by src
    const seen = new Set<string>();
    return items.filter(i => { if (seen.has(i.src)) return false; seen.add(i.src); return true; });
  }, [property]);

  const currentItem = galleryItems[currentIndex] ?? null;
  const hasMultiple = galleryItems.length > 1;
  const goNext = () => setCurrentIndex((prev) => (prev + 1) % galleryItems.length);
  const goPrev = () => setCurrentIndex((prev) => (prev - 1 + galleryItems.length) % galleryItems.length);

  const addToCart = async () => {
    if (!session?.user) { router.push('/login'); return; }
    setAdding(true);
    try {
      const res = await fetch('/api/cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: property?.id }) });
      const data = await res.json();
      if (res.ok) toast.success('Agregado al carrito');
      else toast.error(data?.error ?? 'Error al agregar');
    } catch { toast.error('Error de conexión'); }
    finally { setAdding(false); }
  };

  const toggleFavorite = async () => {
    if (!session?.user) { router.push('/login'); return; }
    try {
      const res = await fetch('/api/favorites', { method: isFav ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: property?.id }) });
      if (res.ok) { setIsFav(!isFav); toast.success(isFav ? 'Eliminado de favoritos' : 'Agregado a favoritos'); }
    } catch { toast.error('Error'); }
  };

  React.useEffect(() => {
    if (session?.user) {
      fetch(`/api/favorites?propertyId=${property?.id}`).then(r => r.json()).then(d => setIsFav(d?.isFavorite ?? false)).catch(() => {});
    }
  }, [session, property?.id]);

  React.useEffect(() => {
    fetch(`/api/properties/${property?.id}/view`, { method: 'POST' }).catch(() => {});
  }, [property?.id]);

  const openFinancingModal = async () => {
    setShowFinancingModal(true);
    if (financingPlans.length === 0) {
      setLoadingPlans(true);
      try {
        const res = await fetch('/api/financing-plans');
        const data = await res.json();
        setFinancingPlans(Array.isArray(data) ? data : []);
      } catch { setFinancingPlans([]); }
      finally { setLoadingPlans(false); }
    }
  };

  // Convert Google Maps URL to embeddable format
  const getEmbedMapUrl = (url: string) => {
    if (!url) return '';
    // Already an embed URL
    if (url.includes('/maps/embed')) return url;
    // Google Maps share link: extract place for embed
    if (url.includes('google.com/maps') || url.includes('goo.gl/maps')) {
      return `https://www.google.com/maps/embed?pb=&q=${encodeURIComponent(property?.address || property?.city || '')}&zoom=15`;
    }
    // If it's a direct image URL (like lh3.googleusercontent.com), don't use as iframe
    if (url.includes('googleusercontent.com') || url.match(/\.(png|jpg|jpeg|gif|webp)$/i)) return '';
    return url;
  };

  return (
    <main className="flex-1">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8">
          {/* Left Column: Gallery */}
          <div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative aspect-[16/10] rounded-xl overflow-hidden bg-muted mb-3">
              {currentItem ? (
                currentItem.type === 'video' ? (
                  <video key={currentItem.src} src={currentItem.src} className="w-full h-full object-cover" controls playsInline preload="metadata" />
                ) : (
                  <Image key={currentItem.src} src={currentItem.src} alt={currentItem.alt} fill className="object-cover" priority />
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">Sin imagen</div>
              )}
              {hasMultiple && (
                <>
                  <button onClick={goPrev} className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2.5" type="button"><ChevronLeft className="w-5 h-5" /></button>
                  <button onClick={goNext} className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2.5" type="button"><ChevronRight className="w-5 h-5" /></button>
                  <div className="absolute top-4 right-4 bg-black/60 rounded-full px-3 py-1 text-xs text-white">{currentIndex + 1} / {galleryItems.length}</div>
                </>  
              )}
              {currentItem?.type === 'image' && (
                <div className="absolute bottom-4 left-4 bg-black/60 text-white text-xs px-3 py-1 rounded-md">Exterior</div>
              )}
            </motion.div>

            {/* Thumbnails */}
            {galleryItems.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {galleryItems.map((item, idx) => (
                  <button key={idx} onClick={() => setCurrentIndex(idx)} className={`relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 transition-all ${idx === currentIndex ? 'border-orange-500 ring-2 ring-orange-500/30' : 'border-transparent opacity-60 hover:opacity-100'}`} type="button">
                    {item.type === 'video' ? <div className="w-full h-full bg-gray-900 flex items-center justify-center"><Video className="w-4 h-4 text-white" /></div> : <Image src={item.src} alt={item.alt} fill className="object-cover" />}
                  </button>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="mt-8 border-b border-border">
              <div className="flex gap-1 overflow-x-auto">
                {TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab ? 'border-orange-500 text-orange-500' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="py-6">
              {activeTab === 'Descripción' && (
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-6">
                  <div className="bg-card border border-border rounded-xl p-5">
                    <p className="text-sm text-muted-foreground leading-relaxed">{property?.description ?? 'Sin descripción disponible.'}</p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h4 className="font-bold text-sm mb-2">¿Querés financiar tu casa?</h4>
                    <p className="text-xs text-muted-foreground mb-3">Consultá los planes de cuotas disponibles para este modelo.</p>
                    <button onClick={openFinancingModal} className="inline-flex items-center gap-2 bg-foreground text-background text-sm font-medium px-4 py-2.5 rounded-lg hover:opacity-90 transition-opacity">
                      <Banknote className="w-4 h-4" /> Ver planes de cuotas
                    </button>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h4 className="font-bold text-sm mb-2">Entrega estimada</h4>
                    <p className="text-xs text-muted-foreground mb-3">{deliveryNote}</p>
                    <div className="flex items-center gap-2 text-orange-500">
                      <Clock className="w-5 h-5" />
                      <span className="text-xl font-bold">{deliveryDays} días</span>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'Planos' && (
                <div>
                  {property?.planImageUrl ? (
                    <div className="space-y-4">
                      <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-muted border border-border">
                        <Image src={property.planImageUrl.startsWith('http') ? property.planImageUrl : property.planImageUrl.startsWith('/') ? property.planImageUrl : `${S3_BASE}${property.planImageUrl}`} alt="Plano de la propiedad" fill className="object-contain" />
                      </div>
                      {property?.planDescription && (
                        <div className="bg-card border border-border rounded-xl p-5">
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{property.planDescription}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <FileImage className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Los planos estarán disponibles próximamente.</p>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'Características' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Estilo', value: property?.constructionStyle ?? '-' },
                    { label: 'Financiación', value: property?.financingStatus ?? '-' },
                    { label: 'Constructora', value: property?.constructionCompany ?? '-' },
                    { label: 'Estado legal', value: property?.legalStatus ?? '-' },
                  ].map((c, i) => (
                    <div key={i} className="bg-card border border-border rounded-xl p-4">
                      <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
                      <div className="font-semibold text-sm">{c.value}</div>
                    </div>
                  ))}
                </div>
              )}
              {activeTab === 'Ubicación' && (
                <div className="space-y-4">
                  <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
                      <div>
                        <h4 className="font-bold text-sm mb-1">{property?.city ?? 'Sin ubicación especificada'}</h4>
                        {property?.locationDetail && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{property.locationDetail}</p>}
                      </div>
                    </div>
                  </div>
                  {property?.locationMapUrl && (() => {
                    const embedUrl = getEmbedMapUrl(property.locationMapUrl);
                    const isImage = property.locationMapUrl.includes('googleusercontent.com') || property.locationMapUrl.match(/\.(png|jpg|jpeg|gif|webp)$/i);
                    if (isImage) {
                      return (
                        <div className="relative aspect-[16/9] rounded-xl overflow-hidden border border-border bg-muted">
                          <Image src={property.locationMapUrl} alt="Mapa de ubicación" fill className="object-cover" />
                        </div>
                      );
                    }
                    if (embedUrl) {
                      return (
                        <div className="rounded-xl overflow-hidden border border-border aspect-[16/9]">
                          <iframe src={embedUrl} className="w-full h-full border-0" allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Mapa de ubicación" />
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
              {activeTab === 'Preguntas frecuentes' && (
                <div className="space-y-3">
                  {faqItems.map((faq: any, i: number) => (
                    <div key={i} className="bg-card border border-border rounded-xl p-4">
                      <h4 className="font-semibold text-sm mb-1">{faq.q}</h4>
                      <p className="text-xs text-muted-foreground">{faq.a}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Info */}
          <div className="space-y-6">
            {/* Badges */}
            <div className="flex gap-2">
              <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-md">{property?.financingStatus ?? 'Consultar'}</span>
              <span className="bg-card border border-border text-xs font-medium px-3 py-1 rounded-md">{property?.constructionStyle ?? 'Moderna'}</span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black">Tipología {property?.address ?? ''}</h1>
              <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
                <Building2 className="w-4 h-4 text-orange-500" />
                <span className="text-sm">{property?.constructionCompany ?? 'Sin especificar'}</span>
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">Precio del modelo</div>
              <div className="text-3xl font-black">{formatARS(property?.price ?? 0)}</div>
            </div>

            <div>
              <p className={`text-sm text-muted-foreground leading-relaxed ${!showFullDesc ? 'line-clamp-4' : ''}`}>
                {property?.description ?? ''}
              </p>
              {(property?.description?.length ?? 0) > 200 && (
                <button onClick={() => setShowFullDesc(!showFullDesc)} className="text-sm font-medium mt-1 inline-flex items-center gap-1 hover:text-orange-500 transition-colors">
                  {showFullDesc ? 'Ver menos' : 'Ver más'} {showFullDesc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>

            {/* Specs */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { icon: Ruler, label: 'Superficie', value: `${property?.surface ?? 0} m²` },
                { icon: Bed, label: 'Dormitorios', value: property?.bedrooms ?? 0 },
                { icon: Bath, label: 'Baños', value: property?.bathrooms ?? 0 },
                { icon: Calendar, label: 'Antigüedad', value: `${property?.age ?? 0} años` },
              ].map((item: any, i: number) => (
                <div key={i} className="bg-card border border-border rounded-xl p-3 text-center">
                  <item.icon className="w-5 h-5 mx-auto mb-1 text-orange-500" />
                  <div className="text-[10px] text-muted-foreground">{item.label}</div>
                  <div className="font-bold text-sm">{item.value}</div>
                </div>
              ))}
            </div>

            {/* Save button */}
            <button
              onClick={toggleFavorite}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                isFav ? 'border-red-500 text-red-500 bg-red-500/5' : 'border-border text-muted-foreground hover:border-orange-500 hover:text-orange-500'
              }`}
            >
              <Heart className={`w-4 h-4 ${isFav ? 'fill-red-500' : ''}`} />
              {isFav ? 'Modelo guardado' : 'Guardar modelo'}
            </button>

            {/* CTA Card */}
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-6">
              <div className="text-sm text-muted-foreground">Precio del asesoramiento</div>
              <div className="text-2xl font-black text-orange-500 mb-4">{formatARS(property?.consultingPrice ?? 30000)}</div>
              <button
                onClick={addToCart}
                disabled={adding}
                className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl transition-colors text-base"
              >
                <ShoppingCart className="w-5 h-5" />
                {adding ? 'Agregando...' : 'Reservar Asesoría'}
              </button>
              <p className="text-xs text-muted-foreground text-center mt-2">Asesoría personalizada incluida</p>
            </div>
          </div>
        </div>

        {/* Trust badges */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12 border-t border-border pt-8">
          {[
            { icon: HeadphonesIcon, title: 'Asesoría personalizada', sub: 'Un experto te acompaña' },
            { icon: Shield, title: 'Reserva 100% segura', sub: 'Protegemos tu información' },
            { icon: Calendar, title: 'Sin compromiso', sub: 'Cancelá cuando quieras' },
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
      </div>

      {/* Financing Plans Modal */}
      {showFinancingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowFinancingModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-border">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2"><Banknote className="w-5 h-5 text-orange-500" /> Planes de Financiación</h3>
                <p className="text-xs text-muted-foreground mt-1">Para: {property?.address}</p>
              </div>
              <button onClick={() => setShowFinancingModal(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {loadingPlans && <p className="text-center text-muted-foreground py-8">Cargando planes...</p>}
              {!loadingPlans && financingPlans.length === 0 && (
                <div className="text-center py-8">
                  <Banknote className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground">No hay planes de financiación disponibles aún.</p>
                  <p className="text-xs text-muted-foreground mt-1">Contactanos para consultar opciones personalizadas.</p>
                </div>
              )}
              {financingPlans.map((plan: any) => {
                const downPayment = property?.price ? Math.round(property.price * plan.downPaymentPct / 100) : null;
                return (
                  <div key={plan.id} className="bg-muted/50 border border-border rounded-xl p-5">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-bold text-sm">{plan.name}</h4>
                      <span className="text-xs bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded-full">{plan.currency}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground">Cuotas</span>
                        <p className="font-bold text-orange-500">{plan.installments}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Anticipo</span>
                        <p className="font-bold">{plan.downPaymentPct}%{downPayment ? ` (${formatARS(downPayment)})` : ''}</p>
                      </div>
                      {plan.monthlyAmount && (
                        <div>
                          <span className="text-xs text-muted-foreground">Cuota mensual</span>
                          <p className="font-bold text-orange-500">{formatARS(plan.monthlyAmount)}</p>
                        </div>
                      )}
                      {plan.totalAmount && (
                        <div>
                          <span className="text-xs text-muted-foreground">Total</span>
                          <p className="font-bold">{formatARS(plan.totalAmount)}</p>
                        </div>
                      )}
                      {plan.interestRate != null && (
                        <div>
                          <span className="text-xs text-muted-foreground">Tasa de interés</span>
                          <p className="font-bold">{plan.interestRate}%</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {financingPlans.length > 0 && (
                <p className="text-xs text-center text-muted-foreground">Los montos son orientativos y pueden variar. Consultá con un asesor para más detalles.</p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </main>
  );
}
