'use client';
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Building2, Ruler, Calendar, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const S3_BASE = 'https://abacusai-apps-f27519269f5a38e35ae8fccd-us-west-2.s3.us-west-2.amazonaws.com/';

function resolveImgUrl(path: string | null | undefined): string {
  if (!path) return '/hero-house.jpg';
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return path; // local public path
  return `${S3_BASE}${path}`;
}

export function ModelosContent({ constructors }: { constructors: any[] }) {
  return (
    <main className="flex-1">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <Link href="/" className="inline-flex items-center gap-1 text-orange-500 text-sm mb-6 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Volver al inicio
        </Link>

        <h1 className="text-2xl font-black mb-2">Elegí tu constructora</h1>
        <p className="text-muted-foreground mb-10">
          Explorá nuestras constructoras aliadas y elegí con quién querés hacer realidad tu hogar.
        </p>

        {constructors.length > 0 ? (
          <div className="space-y-6">
            {constructors.map((c: any, i: number) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="bg-card border border-border rounded-xl overflow-hidden hover:border-orange-500/50 transition-all"
              >
                <div className="flex flex-col lg:flex-row">
                  {/* Cover Image */}
                  <div className="relative w-full lg:w-96 aspect-[16/10] lg:aspect-auto lg:h-auto bg-muted shrink-0">
                    {c.coverCloudPath ? (
                      <Image src={resolveImgUrl(c.coverCloudPath)} alt={c.name} fill className="object-cover" />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Building2 className="w-16 h-16 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 p-6">
                    <div className="flex items-start gap-4 mb-4">
                      {/* Logo */}
                      {c.logoCloudPath && (
                        <div className="w-16 h-16 border border-border rounded-lg overflow-hidden bg-background shrink-0 relative">
                          <Image src={resolveImgUrl(c.logoCloudPath)} alt={`Logo ${c.name}`} fill className="object-contain p-1" />
                        </div>
                      )}
                      <div>
                        <h2 className="text-xl font-bold">{c.name}</h2>
                        {c.styles?.length > 0 && (
                          <div className="mt-1">
                            <span className="text-xs text-orange-500 font-medium"><Building2 className="w-3 h-3 inline mr-1" />Estilo constructivo</span>
                            <p className="text-sm text-muted-foreground">{c.styles.join(' · ')}</p>
                          </div>
                        )}
                      </div>

                      {/* Stats */}
                      <div className="hidden md:flex items-center gap-6 ml-auto">
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><Ruler className="w-3 h-3" />Modelos disponibles</div>
                          <div className="text-2xl font-bold">{c.properties?.length ?? 0}</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><CheckCircle className="w-3 h-3" />Modelos personalizados</div>
                          <div className="text-2xl font-bold">{c.customModels ? 'Sí' : 'No'}</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><Calendar className="w-3 h-3" />Trayectoria</div>
                          <div className="text-2xl font-bold">{c.yearsExperience} años</div>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground mb-4 line-clamp-3">{c.description}</p>

                    <Link
                      href={`/modelos/${c.slug}`}
                      className="inline-flex items-center gap-2 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
                    >
                      Ver modelos disponibles <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No hay constructoras cargadas aún</p>
            <p className="text-sm">Las constructoras se agregan desde el panel de administración.</p>
          </div>
        )}
      </div>

      {/* Bottom note */}
      <div className="border-t border-border">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-orange-500" />
            Todas nuestras constructoras cumplen con altos estándares de calidad y garantía.
          </div>
          <Link href="/asesoria" className="text-orange-500 hover:underline">
            ¿Tenés dudas? Contactar asesor →
          </Link>
        </div>
      </div>
    </main>
  );
}
