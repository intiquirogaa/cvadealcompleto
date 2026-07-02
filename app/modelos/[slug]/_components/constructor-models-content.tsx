'use client';
import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Heart, Building2, Ruler, Bed, Bath, Calendar, Shield, Wrench, HeadphonesIcon, Home } from 'lucide-react';
import { motion } from 'framer-motion';

const S3_BASE = 'https://abacusai-apps-f27519269f5a38e35ae8fccd-us-west-2.s3.us-west-2.amazonaws.com/';

function resolveImgUrl(path: string | null | undefined): string {
  if (!path) return '/hero-house.jpg';
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return path;
  return `${S3_BASE}${path}`;
}

const formatARS = (n: number) => `ARS $ ${n.toLocaleString('es-AR')}`;

function getImageUrl(property: any): string {
  if (property?.media?.length > 0) {
    return `${S3_BASE}${property.media[0].cloudStoragePath}`;
  }
  if (property?.images?.length > 0) return property.images[0];
  return '/hero-house.jpg';
}

export function ConstructorModelsContent({ constructor: c }: { constructor: any }) {
  const router = useRouter();
  const [sortBy, setSortBy] = useState('recent');

  const sorted = [...(c.properties ?? [])].sort((a: any, b: any) => {
    if (sortBy === 'price_asc') return (a.price ?? 0) - (b.price ?? 0);
    if (sortBy === 'price_desc') return (b.price ?? 0) - (a.price ?? 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <main className="flex-1">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <Link href="/modelos" className="inline-flex items-center gap-1 text-orange-500 text-sm mb-6 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Volver a constructoras
        </Link>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="lg:w-72 shrink-0">
            <div className="bg-card border border-border rounded-xl p-6 sticky top-24">
              {c.logoCloudPath && (
                <div className="relative w-32 h-20 mx-auto mb-4">
                  <Image src={resolveImgUrl(c.logoCloudPath)} alt={c.name} fill className="object-contain" />
                </div>
              )}
              <h2 className="text-lg font-bold mb-1">{c.name}</h2>
              {c.styles?.length > 0 && (
                <div className="mb-3">
                  <span className="text-xs text-orange-500 font-medium"><Building2 className="w-3 h-3 inline mr-1" />Estilo constructivo</span>
                  <p className="text-sm text-muted-foreground">{c.styles.join(' · ')}</p>
                </div>
              )}
              <p className="text-sm text-muted-foreground mb-6">{c.description}</p>

              <div className="space-y-3 mb-6">
                {c.yearsExperience > 0 && (
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-orange-500" />
                    <div><div className="text-xs text-muted-foreground">Trayectoria</div><div className="font-bold">{c.yearsExperience} años</div></div>
                  </div>
                )}
                {c.guarantee && (
                  <div className="flex items-center gap-3">
                    <Shield className="w-4 h-4 text-orange-500" />
                    <div><div className="text-xs text-muted-foreground">Garantía</div><div className="font-bold">{c.guarantee}</div></div>
                  </div>
                )}
                {c.counseling && (
                  <div className="flex items-center gap-3">
                    <HeadphonesIcon className="w-4 h-4 text-orange-500" />
                    <div><div className="text-xs text-muted-foreground">Asesoramiento</div><div className="font-bold">{c.counseling}</div></div>
                  </div>
                )}
              </div>

              <Link
                href="/asesoria"
                className="flex items-center justify-center gap-2 w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
              >
                <HeadphonesIcon className="w-4 h-4" /> Contactar asesor
              </Link>
            </div>
          </aside>

          {/* Models Grid */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold">Modelos de {c.name}</h1>
                <p className="text-sm text-muted-foreground">Elegí el modelo que mejor se adapte a tu estilo de vida.</p>
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="text-sm border border-border rounded-lg px-3 py-2 bg-background"
              >
                <option value="recent">Más recientes</option>
                <option value="price_asc">Menor precio</option>
                <option value="price_desc">Mayor precio</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {sorted.map((p: any, i: number) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => router.push(`/properties/${p.id}`)}
                  className="group cursor-pointer bg-card border border-border rounded-xl overflow-hidden hover:border-orange-500/50 transition-all"
                >
                  <div className="relative aspect-[4/3] bg-muted">
                    <Image src={getImageUrl(p)} alt={p.address} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                    {p.isFeatured && (
                      <span className="absolute top-3 left-3 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">Más elegido</span>
                    )}
                    {p.isNewLine && (
                      <span className="absolute top-3 left-3 bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">Nueva línea</span>
                    )}
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white hover:text-orange-500 transition-colors"
                    >
                      <Heart className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold mb-1 group-hover:text-orange-500 transition-colors">{p.address}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{p.description}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
                      <span className="inline-flex items-center gap-1"><Ruler className="w-3 h-3" />{p.surface} m²</span>
                      <span className="inline-flex items-center gap-1"><Bed className="w-3 h-3" />{p.bedrooms}</span>
                      <span className="inline-flex items-center gap-1"><Bath className="w-3 h-3" />{p.bathrooms}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-orange-500">Desde {formatARS(p.price)}</span>
                      <span className="w-7 h-7 rounded-full border border-orange-500 text-orange-500 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-colors">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Custom model card */}
              {c.customModels && (
                <div className="bg-card border border-border border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center min-h-[280px]">
                  <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-4">
                    <Home className="w-8 h-8 text-orange-500" />
                  </div>
                  <h3 className="font-bold mb-1">Modelo personalizado</h3>
                  <p className="text-sm text-muted-foreground mb-4">Diseñamos tu casa a medida, adaptada a tus necesidades y terreno.</p>
                  <Link
                    href="/asesoria"
                    className="border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white font-medium px-5 py-2 rounded-lg transition-colors text-sm"
                  >
                    Solicitar diseño personalizado
                  </Link>
                </div>
              )}
            </div>

            {sorted.length === 0 && !c.customModels && (
              <div className="text-center py-16 text-muted-foreground">
                <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg">No hay modelos cargados aún para esta constructora</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom values */}
      <section className="border-t border-border bg-card">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { icon: Wrench, title: 'Construcción en seco', sub: 'Más rápida y eficiente' },
              { icon: '\u26a1', title: 'Eficiencia energética', sub: 'Ahorro de hasta 50%' },
              { icon: Calendar, title: 'Entrega garantizada', sub: 'Cumplimos los plazos' },
              { icon: Shield, title: 'Materiales de calidad', sub: 'Durabilidad y confort' },
              { icon: HeadphonesIcon, title: 'Acompañamiento', sub: 'En todo el proceso' },
            ].map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                  {typeof v.icon === 'string' ? (
                    <span className="text-sm">{v.icon}</span>
                  ) : (
                    <v.icon className="w-4 h-4 text-orange-500" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-semibold">{v.title}</div>
                  <div className="text-[10px] text-muted-foreground">{v.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
