'use client';
import React, { useState } from 'react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitCompareArrows, X, Plus, Building2, Maximize2, BedDouble, Bath, Calendar, DollarSign } from 'lucide-react';

function getImg(property: any) {
  const uploaded = property?.media?.find((m: any) => m.mediaType === 'image');
  if (uploaded) return 'https://brandpacks.com/wp-content/uploads/edd/2025/01/real-estate-property-listing-sheet-template-ai-psd-eps-canva-03.jpg' + uploaded.cloudStoragePath;
  return property?.images?.[0] ?? '';
}

export function CompareContent({ properties }: { properties: any[] }) {
  const [selected, setSelected] = useState<any[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const addProperty = (p: any) => {
    if (selected.length >= 3) return;
    if (selected.find((s: any) => s.id === p.id)) return;
    setSelected([...selected, p]);
    setShowPicker(false);
  };

  const removeProperty = (id: string) => setSelected(selected.filter((s: any) => s.id !== id));

  const rows = [
    { label: 'Precio', render: (p: any) => `ARS $${(p?.price ?? 0).toLocaleString('es-AR')}` },
    { label: 'Superficie', render: (p: any) => `${p?.surface ?? 0} m²` },
    { label: 'Dormitorios', render: (p: any) => `${p?.bedrooms ?? 0}` },
    { label: 'Baños', render: (p: any) => `${p?.bathrooms ?? 0}` },
    { label: 'Antigüedad', render: (p: any) => `${p?.age ?? 0} años` },
    { label: 'Estilo', render: (p: any) => p?.constructionStyle ?? '-' },
    { label: 'Empresa', render: (p: any) => p?.constructionCompany ?? '-' },
    { label: 'Financiación', render: (p: any) => p?.financingStatus ?? '-' },
    { label: 'Asesoría', render: (p: any) => `ARS $${(p?.consultingPrice ?? 0).toLocaleString('es-AR')}` },
  ];

  return (
    <main className="flex-1">
      <div className="max-w-[1200px] mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-8">
          <GitCompareArrows className="w-6 h-6 text-orange-500" />
          <h1 className="text-2xl font-bold">Comparar Propiedades</h1>
        </div>

        {selected.length > 0 && (
          <div className="overflow-x-auto mb-8">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-3 bg-muted rounded-tl-lg text-sm font-medium text-muted-foreground w-36">Característica</th>
                  {selected.map((p: any) => (
                    <th key={p.id} className="p-3 bg-muted text-center min-w-[200px]">
                      <div className="relative">
                        <button onClick={() => removeProperty(p.id)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
                        <div className="relative aspect-video rounded-md overflow-hidden bg-muted mb-2">
                          {getImg(p) ? <Image src={getImg(p)} alt={p.address} fill className="object-cover" /> : <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">Sin imagen</div>}
                        </div>
                        <p className="font-semibold text-sm truncate">{p.address}</p>
                      </div>
                    </th>
                  ))}
                  {selected.length < 3 && (
                    <th className="p-3 bg-muted text-center min-w-[200px] rounded-tr-lg">
                      <Button variant="outline" onClick={() => setShowPicker(true)} className="border-dashed border-orange-500/30 text-orange-500">
                        <Plus className="w-4 h-4 mr-1" /> Agregar
                      </Button>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-muted/30' : ''}>
                    <td className="p-3 text-sm font-medium text-muted-foreground">{row.label}</td>
                    {selected.map((p: any) => (
                      <td key={p.id} className="p-3 text-center text-sm font-semibold">{row.render(p)}</td>
                    ))}
                    {selected.length < 3 && <td />}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selected.length === 0 && (
          <div className="text-center py-12">
            <GitCompareArrows className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground mb-4">Seleccioná hasta 3 propiedades para comparar</p>
            <Button onClick={() => setShowPicker(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="w-4 h-4 mr-1" /> Seleccionar Propiedades
            </Button>
          </div>
        )}

        {/* Picker modal */}
        {showPicker && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowPicker(false)}>
            <div className="bg-background rounded-lg p-6 max-w-2xl w-full max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-bold text-lg mb-4">Seleccionar Propiedad</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {properties.filter(p => !selected.find(s => s.id === p.id)).map((p: any) => (
                  <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow border" onClick={() => addProperty(p)}>
                    <CardContent className="p-3">
                      <p className="font-semibold text-sm truncate">{p.address}</p>
                      <p className="text-xs text-muted-foreground">{p.constructionCompany} - {p.constructionStyle}</p>
                      <p className="text-sm font-bold text-orange-500 mt-1">ARS ${(p.price ?? 0).toLocaleString('es-AR')}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Button variant="outline" onClick={() => setShowPicker(false)} className="mt-4 w-full">Cerrar</Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
