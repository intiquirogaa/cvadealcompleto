'use client';
import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Home as HomeIcon, Shield, Zap, TrendingUp, Users, CheckCircle, Star, Award, Filter, Building2, Bed, Bath, Ruler, Calendar, DollarSign, ArrowRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const formatARS = (n: number) => `ARS $${n.toLocaleString('es-AR')}`;

const S3_BASE = 'https://abacusai-apps-f27519269f5a38e35ae8fccd-us-west-2.s3.us-west-2.amazonaws.com/';
function getImageUrl(property: any): string {
  if (property?.media?.length > 0) {
    const m = property.media[0];
    const path = m.cloudStoragePath || m.url || '';
    if (path) return path.startsWith('http') ? path : path.startsWith('/') ? path : `${S3_BASE}${path}`;
  }
  if (property?.images?.length > 0) return property.images[0];
  return '/hero-house.jpg';
}

const DEFAULT_HOME_STATS = [
  { icon: Users, value: '+500', label: 'Clientes asesorados', key: 'clientes_asesorados' },
  { icon: CheckCircle, value: '+200', label: 'Viviendas vendidas', key: 'viviendas_vendidas' },
  { icon: Star, value: '4.9/5', label: 'Calificación promedio', key: 'calificacion_promedio' },
  { icon: Award, value: '+10', label: 'Años de experiencia', key: 'anos_experiencia' },
];

export function HomeContent({ properties, statsPopups = [] }: { properties: any[]; statsPopups?: any[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [showFilters, setShowFilters] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('all');
  const [styleFilter, setStyleFilter] = useState('all');
  const [financingFilter, setFinancingFilter] = useState('all');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [activePopup, setActivePopup] = useState<string | null>(null);

  const companies = useMemo(() => {
    const set = new Set((properties ?? []).map((p: any) => p?.constructionCompany).filter(Boolean));
    return ['all', ...Array.from(set)];
  }, [properties]);

  const styles = useMemo(() => {
    const set = new Set((properties ?? []).map((p: any) => p?.constructionStyle).filter(Boolean));
    return ['all', ...Array.from(set)];
  }, [properties]);

  const financingStatuses = useMemo(() => {
    const set = new Set((properties ?? []).map((p: any) => p?.financingStatus).filter(Boolean));
    return ['all', ...Array.from(set)];
  }, [properties]);

  const filtered = useMemo(() => {
    let result = (properties ?? []).filter((p: any) => {
      const q = search.toLowerCase();
      const matchSearch = !q || (p?.address ?? '').toLowerCase().includes(q) || (p?.description ?? '').toLowerCase().includes(q) || (p?.constructionStyle ?? '').toLowerCase().includes(q) || (p?.constructionCompany ?? '').toLowerCase().includes(q) || (p?.city ?? '').toLowerCase().includes(q) || String(p?.bedrooms ?? '').includes(q) || String(p?.surface ?? '').includes(q);
      const matchCompany = companyFilter === 'all' || p?.constructionCompany === companyFilter;
      const matchStyle = styleFilter === 'all' || p?.constructionStyle === styleFilter;
      const matchFinancing = financingFilter === 'all' || p?.financingStatus === financingFilter;
      const matchPriceMin = !priceMin || (p?.price ?? 0) >= Number(priceMin);
      const matchPriceMax = !priceMax || (p?.price ?? 0) <= Number(priceMax);
      return matchSearch && matchCompany && matchStyle && matchFinancing && matchPriceMin && matchPriceMax;
    });
    if (sortBy === 'price_asc') result.sort((a: any, b: any) => (a?.price ?? 0) - (b?.price ?? 0));
    else if (sortBy === 'price_desc') result.sort((a: any, b: any) => (b?.price ?? 0) - (a?.price ?? 0));
    else if (sortBy === 'surface') result.sort((a: any, b: any) => (b?.surface ?? 0) - (a?.surface ?? 0));
    else result.sort((a: any, b: any) => new Date(b?.createdAt ?? 0).getTime() - new Date(a?.createdAt ?? 0).getTime());
    return result;
  }, [properties, search, companyFilter, styleFilter, financingFilter, sortBy, priceMin, priceMax]);

  // Merge DB popups with defaults
  const statsData = DEFAULT_HOME_STATS.map((def) => {
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
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-8 items-center py-12 lg:py-16">
            {/* Left content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.1] mb-4">
                Un hogar es mas<br />
                <span className="text-orange-500">que una casa</span>
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground mb-8 max-w-md">
                Encontrá tu vivienda ideal y reservá una asesoría personalizada con{' '}
                <span className="text-orange-500 font-medium">nuestros expertos</span>.
              </p>

              {/* Search bar */}
              <div className="flex max-w-lg mb-8">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar por dirección, estilo, empresa, ciudad..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-12 pl-12 pr-4 rounded-l-xl border border-r-0 border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>
                <button
                  onClick={() => {
                    const el = document.getElementById('models-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="h-12 px-6 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-r-xl transition-colors text-sm"
                >
                  Buscar
                </button>
              </div>

              {/* Value props */}
              <div className="flex flex-wrap gap-6 mb-6">
                {[
                  { icon: HomeIcon, title: 'Dejá de alquilar', sub: 'Invertí en tu futuro' },
                  { icon: Shield, title: 'Financiación flexible', sub: 'A tu medida' },
                  { icon: Zap, title: 'Entrega ágil', sub: 'Tu casa, antes de lo que pensás' },
                ].map((v, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <v.icon className="w-4 h-4 text-orange-500" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{v.title}</div>
                      <div className="text-xs text-muted-foreground">{v.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              <Link
                href="/modelos"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground border border-border rounded-full px-5 py-2.5 hover:border-orange-500 hover:text-orange-500 transition-colors"
              >
                <TrendingUp className="w-4 h-4" />
                Construimos tu futuro, hoy.
              </Link>
            </motion.div>

            {/* Right image */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative hidden lg:block"
            >
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-muted">
                <Image
                  src="/hero-house.jpg"
                  alt="Casa moderna de construcción en seco con iluminación cálida al atardecer"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="bg-orange-500 text-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {statsData.map((s, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                onClick={() => setActivePopup(s.key)}
                className="flex items-center gap-3 text-left hover:bg-white/10 rounded-lg p-2 -m-2 transition-colors cursor-pointer"
              >
                <s.icon className="w-8 h-8 text-white/80 shrink-0" />
                <div>
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="text-sm text-white/70">{s.label}</div>
                </div>
              </motion.button>
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

      {/* Models Section */}
      <section id="models-section" className="max-w-[1400px] mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold">Modelos Disponibles</h2>
            {search && <p className="text-sm text-muted-foreground mt-1">Mostrando {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} para &ldquo;{search}&rdquo;</p>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
                showFilters ? 'border-orange-500 text-orange-500 bg-orange-500/10' : 'border-border text-muted-foreground hover:text-orange-500 hover:border-orange-500'
              }`}
            >
              <Filter className="w-4 h-4" /> Filtros
            </button>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-background"
            >
              <option value="recent">Más recientes</option>
              <option value="price_asc">Precio: menor a mayor</option>
              <option value="price_desc">Precio: mayor a menor</option>
              <option value="surface">Mayor superficie</option>
            </select>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-8 p-5 bg-card border border-border rounded-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Empresa Constructora</label>
                <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="w-full text-sm border rounded-lg px-3 py-2 bg-background border-border">
                  {companies.map((c) => <option key={c} value={c}>{c === 'all' ? 'Todas' : c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Estilo Constructivo</label>
                <select value={styleFilter} onChange={(e) => setStyleFilter(e.target.value)} className="w-full text-sm border rounded-lg px-3 py-2 bg-background border-border">
                  {styles.map((s) => <option key={s} value={s}>{s === 'all' ? 'Todos' : s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Estado Financiación</label>
                <select value={financingFilter} onChange={(e) => setFinancingFilter(e.target.value)} className="w-full text-sm border rounded-lg px-3 py-2 bg-background border-border">
                  {financingStatuses.map((f) => <option key={f} value={f}>{f === 'all' ? 'Todos' : f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Rango de Precio (ARS)</label>
                <div className="flex gap-2">
                  <input placeholder="Mín" type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} className="w-full text-sm border rounded-lg px-3 py-2 bg-background border-border" />
                  <input placeholder="Máx" type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} className="w-full text-sm border rounded-lg px-3 py-2 bg-background border-border" />
                </div>
              </div>
            </div>
            {(companyFilter !== 'all' || styleFilter !== 'all' || financingFilter !== 'all' || priceMin || priceMax) && (
              <button
                onClick={() => { setCompanyFilter('all'); setStyleFilter('all'); setFinancingFilter('all'); setPriceMin(''); setPriceMax(''); }}
                className="mt-3 text-xs text-orange-500 hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </motion.div>
        )}

        {/* Horizontal Cards */}
        <div className="space-y-6">
          {filtered.map((property: any, index: number) => (
            <motion.div
              key={property?.id ?? index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => router.push(`/properties/${property.id}`)}
              className="group cursor-pointer flex flex-col sm:flex-row bg-card border border-border rounded-xl overflow-hidden hover:border-orange-500/50 hover:shadow-lg transition-all"
            >
              {/* Image */}
              <div className="relative w-full sm:w-72 lg:w-80 shrink-0 aspect-[4/3] sm:aspect-auto sm:h-auto bg-muted">
                <Image
                  src={getImageUrl(property)}
                  alt={property?.address ?? 'Modelo de vivienda'}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {/* Price badge */}
                <span className="absolute top-3 left-3 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-md">
                  {formatARS(property?.price ?? 0)}
                </span>
                {/* Financing badge */}
                {property?.financingStatus && (
                  <span className="absolute top-3 right-3 bg-black/70 text-white text-xs font-medium px-2.5 py-1 rounded-md">
                    {property.financingStatus}
                  </span>
                )}
                {/* New badge */}
                {(property?.isNewLine || index < 2) && (
                  <span className="absolute bottom-3 left-3 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                    Nuevo
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 p-5 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold mb-1 group-hover:text-orange-500 transition-colors">
                    {property?.constructionStyle ?? 'Modelo'}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                    {property?.description ?? ''}
                  </p>
                  {/* Specs */}
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                    <span className="inline-flex items-center gap-1"><Ruler className="w-3.5 h-3.5" />{property?.surface ?? 0}m²</span>
                    <span className="inline-flex items-center gap-1"><Bed className="w-3.5 h-3.5" />{property?.bedrooms ?? 0}</span>
                    <span className="inline-flex items-center gap-1"><Bath className="w-3.5 h-3.5" />{property?.bathrooms ?? 0}</span>
                    <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{property?.age ?? 0} años</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <HomeIcon className="w-3.5 h-3.5 text-orange-500" />
                    {property?.constructionCompany ?? 'Constructora'}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/properties/${property.id}`); }}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    Asesoría {formatARS(property?.consultingPrice ?? 30000).replace('ARS ', '')}
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No se encontraron propiedades</p>
            <p className="text-sm">Intentá ajustar los filtros de búsqueda</p>
          </div>
        )}
      </section>
    </main>
  );
}
