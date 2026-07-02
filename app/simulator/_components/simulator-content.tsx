'use client';
import React, { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Heart, LayoutGrid, RotateCcw,
  Palette, Eye, Bed, Bath, Ruler, CheckCircle, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const S3_BASE = 'https://abacusai-apps-f27519269f5a38e35ae8fccd-us-west-2.s3.us-west-2.amazonaws.com/';
const getUrl = (p: string) => {
  if (!p) return '';
  if (p.startsWith('http')) return p;
  if (p.startsWith('/')) return p;
  return `${S3_BASE}${p}`;
};

interface Props {
  properties: any[];
  combinations: any[];
  colors: any[];
  revestimientos: any[];
}

export function SimulatorContent({ properties, combinations, colors, revestimientos }: Props) {
  const { data: session } = useSession() || {};

  // Selected property
  const propertiesWithCombos = useMemo(() => {
    const ids = new Set(combinations.map((c: any) => c.propertyId));
    return properties.filter((p: any) => ids.has(p.id));
  }, [properties, combinations]);

  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [viewType, setViewType] = useState<'exterior' | 'interior'>('exterior');
  const [selectedPrimaryColor, setSelectedPrimaryColor] = useState<string>('');
  const [selectedSecondaryColor, setSelectedSecondaryColor] = useState<string>('');
  const [selectedRevestimiento, setSelectedRevestimiento] = useState<string>('');
  const [revCategory, setRevCategory] = useState<'paredes' | 'zocalo' | 'detalles'>('paredes');
  const [imageIdx, setImageIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  // Initialize with first property that has combinations
  useEffect(() => {
    if (propertiesWithCombos.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(propertiesWithCombos[0].id);
    }
  }, [propertiesWithCombos, selectedPropertyId]);

  // Colors for selected property
  const propColors = useMemo(() => colors.filter((c: any) => c.propertyId === selectedPropertyId), [colors, selectedPropertyId]);
  const primaryColors = propColors.filter((c: any) => c.type === 'primary');
  const secondaryColors = propColors.filter((c: any) => c.type === 'secondary');

  // Revestimientos for selected property
  const propRevs = useMemo(() => revestimientos.filter((r: any) => r.propertyId === selectedPropertyId), [revestimientos, selectedPropertyId]);
  const filteredRevs = propRevs.filter((r: any) => r.category === revCategory);

  // Combinations for selected property
  const propCombos = useMemo(() => combinations.filter((c: any) => c.propertyId === selectedPropertyId), [combinations, selectedPropertyId]);
  const viewCombos = propCombos.filter((c: any) => c.viewType === viewType);
  const recommendedCombos = propCombos.filter((c: any) => c.isRecommended);

  // Auto-select first color/revestimiento when property changes
  useEffect(() => {
    if (primaryColors.length > 0) setSelectedPrimaryColor(primaryColors[0].hexCode);
    else setSelectedPrimaryColor('');
    if (secondaryColors.length > 0) setSelectedSecondaryColor(secondaryColors[0].hexCode);
    else setSelectedSecondaryColor('');
    if (filteredRevs.length > 0) setSelectedRevestimiento(filteredRevs[0].name);
    else if (propRevs.length > 0) setSelectedRevestimiento(propRevs[0].name);
    else setSelectedRevestimiento('');
    setImageIdx(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId]);

  // Find matching combination
  const matchingCombos = useMemo(() => {
    let matches = viewCombos;
    if (selectedPrimaryColor) matches = matches.filter((c: any) => c.colorPrimary === selectedPrimaryColor);
    if (selectedSecondaryColor) matches = matches.filter((c: any) => c.colorSecondary === selectedSecondaryColor);
    if (selectedRevestimiento) matches = matches.filter((c: any) => c.revestimiento === selectedRevestimiento);
    return matches.length > 0 ? matches : viewCombos;
  }, [viewCombos, selectedPrimaryColor, selectedSecondaryColor, selectedRevestimiento]);

  const currentCombo = matchingCombos[imageIdx % Math.max(matchingCombos.length, 1)] || viewCombos[0] || propCombos[0];
  const totalImages = matchingCombos.length || 1;

  const selectedProperty = properties.find((p: any) => p.id === selectedPropertyId);
  const propThumb = selectedProperty?.media?.[0]?.cloudStoragePath
    ? getUrl(selectedProperty.media[0].cloudStoragePath)
    : '/hero-house.jpg';

  const handleReset = () => {
    if (primaryColors.length > 0) setSelectedPrimaryColor(primaryColors[0].hexCode);
    if (secondaryColors.length > 0) setSelectedSecondaryColor(secondaryColors[0].hexCode);
    if (propRevs.length > 0) setSelectedRevestimiento(propRevs[0].name);
    setImageIdx(0);
    setViewType('exterior');
  };

  const handleSaveCombination = async () => {
    if (!session?.user) { toast.error('Iniciá sesión para guardar combinaciones'); return; }
    toast.success('Combinación guardada en tus favoritos');
  };

  const applyRecommended = (combo: any) => {
    if (combo.colorPrimary) setSelectedPrimaryColor(combo.colorPrimary);
    if (combo.colorSecondary) setSelectedSecondaryColor(combo.colorSecondary);
    if (combo.revestimiento) setSelectedRevestimiento(combo.revestimiento);
    if (combo.viewType) setViewType(combo.viewType);
    setImageIdx(0);
  };

  if (propertiesWithCombos.length === 0) {
    return (
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          <Palette className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Próximamente</h2>
          <p className="text-muted-foreground">Estamos preparando las combinaciones de colores y revestimientos. ¡Volvé pronto!</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        {/* Back link */}
        <Link href={selectedPropertyId ? `/properties/${selectedPropertyId}` : '/modelos'} className="inline-flex items-center gap-1 text-sm text-orange-500 hover:text-orange-600 mb-4">
          <ArrowLeft className="w-4 h-4" /> Volver al modelo
        </Link>

        <h1 className="text-2xl font-black mb-1">Simulación de colores y revestimientos</h1>
        <p className="text-sm text-muted-foreground mb-6">Personalizá tu hogar y mirá cómo queda antes de decidir.</p>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* ======= LEFT PANEL ======= */}
          <div className="lg:w-[380px] shrink-0 space-y-5">
            {/* Property selector */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                  <Image src={propThumb} alt="Modelo" fill className="object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <select
                    value={selectedPropertyId}
                    onChange={(e) => { setSelectedPropertyId(e.target.value); setImageIdx(0); }}
                    className="w-full text-sm font-semibold bg-transparent border-0 p-0 focus:ring-0 cursor-pointer"
                  >
                    {propertiesWithCombos.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.address}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedProperty?.surface} m² · {selectedProperty?.bedrooms} dorm. · {selectedProperty?.bathrooms} baño{(selectedProperty?.bathrooms ?? 0) > 1 ? 's' : ''}
                  </p>
                  <Link href={selectedPropertyId ? `/properties/${selectedPropertyId}` : '#'} className="text-xs text-orange-500 hover:underline">Ver detalles del modelo</Link>
                </div>
              </div>
            </div>

            {/* View type tabs */}
            <div className="flex rounded-lg overflow-hidden border border-border">
              <button
                onClick={() => { setViewType('exterior'); setImageIdx(0); }}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${viewType === 'exterior' ? 'bg-orange-500 text-white' : 'bg-card text-muted-foreground hover:text-foreground'}`}
              >
                Exterior
              </button>
              <button
                onClick={() => { setViewType('interior'); setImageIdx(0); }}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${viewType === 'interior' ? 'bg-orange-500 text-white' : 'bg-card text-muted-foreground hover:text-foreground'}`}
              >
                Interior
              </button>
            </div>

            {/* Colors section */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="font-bold text-sm mb-3">Colores {viewType === 'exterior' ? 'exteriores' : 'interiores'}</h3>

              {primaryColors.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-2">Color principal</p>
                  <div className="flex gap-2 flex-wrap">
                    {primaryColors.map((c: any) => (
                      <button
                        key={c.id}
                        title={c.name}
                        onClick={() => { setSelectedPrimaryColor(c.hexCode); setImageIdx(0); }}
                        className={`w-9 h-9 rounded-full border-2 transition-all ${selectedPrimaryColor === c.hexCode ? 'border-orange-500 ring-2 ring-orange-500/30 scale-110' : 'border-border hover:scale-105'}`}
                        style={{ backgroundColor: c.hexCode }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {secondaryColors.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Color secundario</p>
                  <div className="flex gap-2 flex-wrap">
                    {secondaryColors.map((c: any) => (
                      <button
                        key={c.id}
                        title={c.name}
                        onClick={() => { setSelectedSecondaryColor(c.hexCode); setImageIdx(0); }}
                        className={`w-9 h-9 rounded-full border-2 transition-all ${selectedSecondaryColor === c.hexCode ? 'border-orange-500 ring-2 ring-orange-500/30 scale-110' : 'border-border hover:scale-105'}`}
                        style={{ backgroundColor: c.hexCode }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {primaryColors.length === 0 && secondaryColors.length === 0 && (
                <p className="text-xs text-muted-foreground">No hay colores configurados para este modelo.</p>
              )}
            </div>

            {/* Revestimientos section */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="font-bold text-sm mb-3">Revestimientos</h3>
              {/* Category tabs */}
              <div className="flex gap-4 mb-3 border-b border-border">
                {(['paredes', 'zocalo', 'detalles'] as const).map(cat => {
                  const catRevs = propRevs.filter((r: any) => r.category === cat);
                  if (catRevs.length === 0) return null;
                  return (
                    <button
                      key={cat}
                      onClick={() => setRevCategory(cat)}
                      className={`pb-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                        revCategory === cat ? 'border-orange-500 text-orange-500' : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {cat === 'zocalo' ? 'Zócalo' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </button>
                  );
                })}
              </div>

              {/* Revestimiento thumbnails */}
              <div className="grid grid-cols-3 gap-2">
                {filteredRevs.map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => { setSelectedRevestimiento(r.name); setImageIdx(0); }}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                      selectedRevestimiento === r.name ? 'border-orange-500 ring-2 ring-orange-500/30' : 'border-border hover:border-orange-500/50'
                    }`}
                  >
                    <div className="relative aspect-square bg-muted">
                      <Image src={getUrl(r.thumbnailCloudPath)} alt={r.name} fill className="object-cover" />
                    </div>
                    <p className="text-[10px] text-center py-1 truncate px-1">{r.name}</p>
                    {selectedRevestimiento === r.name && (
                      <div className="absolute top-1 right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {filteredRevs.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">No hay revestimientos en esta categoría.</p>
              )}
            </div>
          </div>

          {/* ======= RIGHT PANEL ======= */}
          <div className="flex-1 space-y-5">
            {/* Main preview image */}
            <div className="relative bg-card border border-border rounded-xl overflow-hidden">
              <div className="absolute top-3 left-3 z-10">
                <span className="inline-flex items-center gap-1.5 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full">
                  <Eye className="w-3.5 h-3.5" /> Vista {viewType}
                </span>
              </div>

              <div className="relative aspect-[16/9] bg-muted">
                <AnimatePresence mode="wait">
                  {currentCombo && (
                    <motion.div
                      key={currentCombo.id + '-' + imageIdx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="absolute inset-0"
                    >
                      <Image
                        src={getUrl(currentCombo.imageCloudPath)}
                        alt={currentCombo.name || 'Simulación'}
                        fill
                        className="object-cover"
                        priority
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {!currentCombo && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Palette className="w-12 h-12 mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">Seleccioná colores y revestimientos para ver la simulación</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Image navigation */}
              {totalImages > 1 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3">
                  <button
                    onClick={() => setImageIdx(Math.max(0, imageIdx - 1))}
                    disabled={imageIdx === 0}
                    className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-white bg-black/50 px-3 py-1 rounded-full">{imageIdx + 1} / {totalImages}</span>
                  <button
                    onClick={() => setImageIdx(Math.min(totalImages - 1, imageIdx + 1))}
                    disabled={imageIdx >= totalImages - 1}
                    className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Quick action buttons */}
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button onClick={handleSaveCombination} className="w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 transition-colors shadow-lg">
                  <Heart className="w-5 h-5" />
                </button>
                <button className="w-10 h-10 rounded-full bg-white/20 backdrop-blur text-white flex items-center justify-center hover:bg-white/30 transition-colors">
                  <LayoutGrid className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Recommended combinations */}
            {recommendedCombos.length > 0 && (
              <div>
                <h3 className="font-bold text-sm mb-3">Combinaciones recomendadas</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {recommendedCombos.map((combo: any) => {
                    const isActive = currentCombo?.id === combo.id;
                    return (
                      <button
                        key={combo.id}
                        onClick={() => applyRecommended(combo)}
                        className={`relative rounded-xl overflow-hidden border-2 transition-all text-left ${
                          isActive ? 'border-orange-500 ring-2 ring-orange-500/30' : 'border-border hover:border-orange-500/50'
                        }`}
                      >
                        <div className="relative aspect-[4/3] bg-muted">
                          <Image src={getUrl(combo.imageCloudPath)} alt={combo.name} fill className="object-cover" />
                          {isActive && (
                            <div className="absolute top-2 right-2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                              <CheckCircle className="w-3.5 h-3.5 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-xs font-semibold truncate">{combo.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{combo.style}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bottom bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="w-4 h-4 text-orange-500 shrink-0" />
                <span>La simulación es referencial. Los colores pueden variar según la luz y el entorno.</span>
              </div>
              <div className="flex gap-3">
                <button onClick={handleReset} className="inline-flex items-center gap-2 border border-border text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-muted transition-colors">
                  <RotateCcw className="w-4 h-4" /> Restablecer
                </button>
                <button onClick={handleSaveCombination} className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
                  <Heart className="w-4 h-4" /> Guardar combinación
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
