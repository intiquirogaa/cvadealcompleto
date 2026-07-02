'use client';
import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, MapPin, Eye, Calendar, ArrowRight, Users, Star, Clock, Map, X, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const categories = ['Todas', 'Entregas', 'Novedades', 'Testimonios', 'Eventos'];
const categoryMap: Record<string, string> = { 'Todas': 'all', 'Entregas': 'Entrega', 'Novedades': 'Novedad', 'Testimonios': 'Testimonio', 'Eventos': 'Evento' };

const DEFAULT_ENTREGAS_STATS = [
  { icon: Users, value: '+50', label: 'Entregas realizadas', key: 'entregas_realizadas' },
  { icon: Star, value: '100%', label: 'Clientes satisfechos', key: 'clientes_satisfechos' },
  { icon: Clock, value: '45 días', label: 'Tiempo promedio', key: 'tiempo_promedio' },
  { icon: Map, value: 'Neuquén, Río Negro', label: 'y toda la Patagonia', key: 'cobertura_geografica' },
];

export function EntregasContent({ posts, statsPopups = [] }: { posts: any[]; statsPopups?: any[] }) {
  const [activeCategory, setActiveCategory] = useState('Todas');
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [activePopup, setActivePopup] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (activeCategory === 'Todas') return posts;
    return posts.filter((p: any) => p.category === categoryMap[activeCategory]);
  }, [posts, activeCategory]);

  const statsData = DEFAULT_ENTREGAS_STATS.map((def) => {
    const dbPopup = (statsPopups ?? []).find((p: any) => p.statKey === def.key);
    return {
      ...def,
      value: dbPopup?.value || def.value,
      label: dbPopup?.label || def.label,
      popupTitle: dbPopup?.title || '',
      popupContent: dbPopup?.content || '',
      hasPopup: !!(dbPopup?.title || dbPopup?.content),
    };
  });

  const activePopupData = statsData.find((s) => s.key === activePopup);

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="relative py-12 lg:py-16 overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <BookOpen className="w-8 h-8 text-orange-500" />
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black">
                  Entregas y <span className="text-orange-500">Novedades</span>
                </h1>
              </div>
              <p className="text-muted-foreground max-w-md">
                Historias reales de personas que ya recibieron su hogar y todas las novedades de <span className="text-orange-500 font-medium">CVA Deal</span>.
              </p>
            </div>
            <div className="relative hidden lg:block aspect-[16/9] rounded-2xl overflow-hidden bg-muted">
              <Image src="/hero-house.jpg" alt="Entregas y novedades CVA Deal" fill className="object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* Category tabs */}
      <section className="max-w-[1400px] mx-auto px-4 sm:px-6 mb-8">
        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-orange-500 text-white'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* Posts Grid */}
      <section className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-12">
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((post: any, i: number) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => setSelectedPost(post)}
                className="group bg-card border border-border rounded-xl overflow-hidden hover:border-orange-500/50 transition-all cursor-pointer"
              >
                <div className="relative aspect-[16/10] bg-muted">
                  {post.coverImage && (
                    <Image src={post.coverImage} alt={post.title} fill className="object-cover" />
                  )}
                  <span className="absolute top-3 left-3 bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-md">
                    {post.category}
                  </span>
                  {post.location && (
                    <span className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-2.5 py-1 rounded-md inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {post.location}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                    <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(post.createdAt).toLocaleDateString('es-AR')}</span>
                    {post.constructorRef && (
                      <span className="inline-flex items-center gap-1 text-orange-500"><Building2 className="w-3 h-3" />{post.constructorRef.name}</span>
                    )}
                  </div>
                  <h3 className="font-bold mb-1 group-hover:text-orange-500 transition-colors">{post.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{post.excerpt}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Eye className="w-3 h-3" /> {post.viewCount ?? 0} vistas
                    </span>
                    <span className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No hay publicaciones aún</p>
            <p className="text-sm">Las entregas y novedades aparecerán aquí.</p>
          </div>
        )}
      </section>

      {/* Blog Post Detail Modal */}
      <AnimatePresence>
        {selectedPost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setSelectedPost(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-background rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedPost(null)}
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              {selectedPost.coverImage && (
                <div className="relative aspect-[16/9] bg-muted">
                  <Image src={selectedPost.coverImage} alt={selectedPost.title} fill className="object-cover rounded-t-2xl" />
                  <span className="absolute top-4 left-4 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-md">
                    {selectedPost.category}
                  </span>
                </div>
              )}
              <div className="p-6">
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                  <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(selectedPost.createdAt).toLocaleDateString('es-AR')}</span>
                  <span>{selectedPost.author}</span>
                  {selectedPost.location && (
                    <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{selectedPost.location}</span>
                  )}
                  {selectedPost.constructorRef && (
                    <span className="inline-flex items-center gap-1 text-orange-500"><Building2 className="w-3 h-3" />{selectedPost.constructorRef.name}</span>
                  )}
                </div>
                <h2 className="text-2xl font-black mb-3">{selectedPost.title}</h2>
                {selectedPost.excerpt && (
                  <p className="text-sm text-muted-foreground mb-4 italic">{selectedPost.excerpt}</p>
                )}
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {(selectedPost.content ?? '').split('\n').map((p: string, i: number) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" /> {selectedPost.viewCount ?? 0} vistas</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats bar */}
      <section className="bg-card border-t border-border">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {statsData.map((s, i) => (
              <button
                key={i}
                onClick={() => setActivePopup(s.key)}
                className="flex items-center gap-3 text-left hover:bg-muted rounded-lg p-2 -m-2 transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                  <s.icon className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <div className="text-lg font-bold">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Popup Modal */}
      <AnimatePresence>
        {activePopup && activePopupData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setActivePopup(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-background rounded-2xl shadow-2xl max-w-lg w-full p-6 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setActivePopup(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted-foreground/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center">
                  <activePopupData.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{activePopupData.value}</div>
                  <div className="text-sm text-muted-foreground">{activePopupData.label}</div>
                </div>
              </div>
              {activePopupData.hasPopup ? (
                <>
                  {activePopupData.popupTitle && <h3 className="text-lg font-bold mb-2">{activePopupData.popupTitle}</h3>}
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{activePopupData.popupContent}</div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Información detallada próximamente. El administrador puede personalizar este contenido desde el panel de administración.</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
