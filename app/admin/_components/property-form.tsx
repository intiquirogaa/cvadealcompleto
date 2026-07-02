'use client';
import React, { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Save, X, Upload, Trash2, ImageIcon, Video, Loader2 } from 'lucide-react';

interface PropertyFormProps {
  property?: any;
  constructors?: any[];
  onClose: () => void;
  onSave: () => void;
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'video/mp4'];
const MAX_SIZE = 10 * 1024 * 1024;

const CONSTRUCTION_STYLES = ['Moderna', 'Clásica', 'Minimalista', 'Colonial', 'Rústica', 'Industrial', 'Mediterránea', 'Art Deco', 'Contemporánea'];
const FINANCING_OPTIONS = ['Consultar', 'Acepta crédito hipotecario', 'Solo contado', 'Financiación directa', 'Acepta permuta'];

export function PropertyForm({ property, constructors = [], onClose, onSave }: PropertyFormProps) {
  const isEdit = !!property;
  const [form, setForm] = useState({
    address: property?.address ?? '',
    constructionCompany: property?.constructionCompany ?? 'Sin especificar',
    constructorId: property?.constructorId ?? '',
    price: property?.price ?? 0,
    surface: property?.surface ?? 0,
    age: property?.age ?? 0,
    financingStatus: property?.financingStatus ?? 'Consultar',
    constructionStyle: property?.constructionStyle ?? 'Moderna',
    consultingPrice: property?.consultingPrice ?? 80,
    description: property?.description ?? '',
    bedrooms: property?.bedrooms ?? 3,
    bathrooms: property?.bathrooms ?? 2,
    images: (property?.images ?? []).join(', '),
    planImageUrl: property?.planImageUrl ?? '',
    planDescription: property?.planDescription ?? '',
    faqJson: property?.faqJson ?? '[]',
    locationDetail: property?.locationDetail ?? '',
    locationMapUrl: property?.locationMapUrl ?? '',
    deliveryTimeDays: property?.deliveryTimeDays ?? 45,
    deliveryTimeNote: property?.deliveryTimeNote ?? '',
    financingSimDetail: property?.financingSimDetail ?? '',
  });
  const [faqList, setFaqList] = useState<{q:string;a:string}[]>(() => {
    try { const p = JSON.parse(property?.faqJson || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
  });
  const [saving, setSaving] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<any[]>(property?.media ?? []);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = (field: string, value: any) => setForm((prev: any) => ({ ...(prev ?? {}), [field]: value }));

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    for (const file of fileList) {
      if (!ALLOWED_TYPES.includes(file.type)) { toast.error(`"${file.name}" no es un formato válido. Solo PNG, JPG y MP4.`); return; }
      if (file.size > MAX_SIZE) { toast.error(`"${file.name}" excede el límite de 10 MB.`); return; }
    }
    if (!isEdit) { toast.error('Primero guarda la propiedad para poder subir archivos'); return; }
    setUploading(true);
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      setUploadProgress(`Subiendo ${i + 1} de ${fileList.length}: ${file.name}`);
      try {
        const presignedRes = await fetch('/api/upload/presigned', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size }),
        });
        if (!presignedRes.ok) { const err = await presignedRes.json(); toast.error(err?.error ?? 'Error al generar URL de subida'); continue; }
        const { uploadUrl, cloudStoragePath } = await presignedRes.json();
        const urlObj = new URL(uploadUrl);
        const signedHeaders = urlObj.searchParams.get('X-Amz-SignedHeaders') ?? '';
        const headers: Record<string, string> = { 'Content-Type': file.type };
        if (signedHeaders.includes('content-disposition')) { headers['Content-Disposition'] = 'attachment'; }
        const uploadRes = await fetch(uploadUrl, { method: 'PUT', headers, body: file });
        if (!uploadRes.ok) { toast.error(`Error al subir "${file.name}"`); continue; }
        const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
        const completeRes = await fetch('/api/upload/complete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId: property.id, cloudStoragePath, fileName: file.name, fileType: file.type, fileSize: file.size, mediaType }),
        });
        if (completeRes.ok) { const newMedia = await completeRes.json(); setMediaFiles((prev: any[]) => [...prev, newMedia]); toast.success(`"${file.name}" subido correctamente`); }
        else { toast.error(`Error al registrar "${file.name}"`); }
      } catch (err: any) { console.error('Upload error:', err); toast.error(`Error al subir "${file.name}"`); }
    }
    setUploading(false); setUploadProgress('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [isEdit, property?.id]);

  const deleteMedia = async (mediaId: string) => {
    if (!confirm('¿Eliminar este archivo?')) return;
    try {
      const res = await fetch(`/api/upload/${mediaId}`, { method: 'DELETE' });
      if (res.ok) { setMediaFiles((prev: any[]) => prev.filter((m: any) => m.id !== mediaId)); toast.success('Archivo eliminado'); }
      else { toast.error('Error al eliminar'); }
    } catch (e: any) { toast.error('Error de conexión'); }
  };

  const getMediaUrl = (media: any) => {
    if (media?.url) return media.url;
    const bucketName = 'abacusai-apps-f27519269f5a38e35ae8fccd-us-west-2';
    const region = 'us-west-2';
    return `https://${bucketName}.s3.${region}.amazonaws.com/${media.cloudStoragePath}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    if (!form?.address) { toast.error('La dirección es requerida'); return; }
    setSaving(true);
    try {
      const data = {
        ...form,
        constructorId: form?.constructorId || null,
        price: Number(form?.price ?? 0),
        surface: Number(form?.surface ?? 0),
        age: Number(form?.age ?? 0),
        consultingPrice: Number(form?.consultingPrice ?? 0),
        bedrooms: Number(form?.bedrooms ?? 0),
        bathrooms: Number(form?.bathrooms ?? 0),
        deliveryTimeDays: Number(form?.deliveryTimeDays ?? 45),
        images: (form?.images ?? '').split(',').map((s: string) => s?.trim?.() ?? '').filter(Boolean),
        faqJson: JSON.stringify(faqList),
      };
      const url = isEdit ? `/api/properties/${property?.id}` : '/api/properties';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (res.ok) { toast.success(isEdit ? 'Propiedad actualizada' : 'Propiedad creada'); onSave(); }
      else { const err = await res.json(); toast.error(err?.error ?? 'Error'); }
    } catch (e: any) { toast.error('Error de conexión'); }
    finally { setSaving(false); }
  };

  return (
    <Card className="border-0 shadow-md">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg text-foreground">{isEdit ? 'Editar Propiedad' : 'Nueva Propiedad'}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Dirección *</Label>
            <Input value={form?.address ?? ''} onChange={(e: any) => update('address', e?.target?.value ?? '')} placeholder="Av. Libertador 4500, Palermo" />
          </div>
          <div>
            <Label>Constructora</Label>
            <select value={form?.constructorId ?? ''} onChange={(e: any) => { update('constructorId', e?.target?.value ?? ''); const sel = constructors.find((c: any) => c.id === e?.target?.value); update('constructionCompany', sel ? sel.name : 'Sin especificar'); }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Sin constructora</option>
              {constructors.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Estilo de Construcción</Label>
            <select value={form?.constructionStyle ?? 'Moderna'} onChange={(e: any) => update('constructionStyle', e?.target?.value ?? 'Moderna')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {CONSTRUCTION_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <Label>Precio (ARS)</Label>
            <Input type="number" value={form?.price ?? 0} onChange={(e: any) => update('price', e?.target?.value ?? 0)} />
          </div>
          <div>
            <Label>Superficie (m²)</Label>
            <Input type="number" value={form?.surface ?? 0} onChange={(e: any) => update('surface', e?.target?.value ?? 0)} />
          </div>
          <div>
            <Label>Antigüedad (años)</Label>
            <Input type="number" value={form?.age ?? 0} onChange={(e: any) => update('age', e?.target?.value ?? 0)} />
          </div>
          <div>
            <Label>Estado de Financiación</Label>
            <select value={form?.financingStatus ?? 'Consultar'} onChange={(e: any) => update('financingStatus', e?.target?.value ?? 'Consultar')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {FINANCING_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <Label>Precio Asesoría (ARS)</Label>
            <Input type="number" value={form?.consultingPrice ?? 0} onChange={(e: any) => update('consultingPrice', e?.target?.value ?? 0)} />
          </div>
          <div>
            <Label>Dormitorios</Label>
            <Input type="number" value={form?.bedrooms ?? 0} onChange={(e: any) => update('bedrooms', e?.target?.value ?? 0)} />
          </div>
          <div>
            <Label>Baños</Label>
            <Input type="number" value={form?.bathrooms ?? 0} onChange={(e: any) => update('bathrooms', e?.target?.value ?? 0)} />
          </div>
          <div className="md:col-span-2">
            <Label>Imágenes externas (URLs separadas por coma, opcional)</Label>
            <Input value={form?.images ?? ''} onChange={(e: any) => update('images', e?.target?.value ?? '')} placeholder="https://ejemplo.com/foto.jpg" />
          </div>
          <div className="md:col-span-2">
            <Label>Descripción</Label>
            <Textarea value={form?.description ?? ''} onChange={(e: any) => update('description', e?.target?.value ?? '')} rows={3} />
          </div>

          {/* Nuevos campos: Planos, FAQ, Ubicación, Entrega, Financiación */}
          <div className="md:col-span-2 border-t pt-4 mt-2">
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2"><ImageIcon className="w-4 h-4 text-orange-500" /> Contenido de la Propiedad</h4>
          </div>
          <div className="md:col-span-2">
            <Label>URL Imagen del Plano (opcional)</Label>
            <Input value={form?.planImageUrl ?? ''} onChange={(e: any) => update('planImageUrl', e?.target?.value ?? '')} placeholder="https://wpmedia.roomsketcher.com/content/uploads/2022/01/06145940/What-is-a-floor-plan-with-dimensions.png o ruta S3" />
          </div>
          <div className="md:col-span-2">
            <Label>Descripción del Plano</Label>
            <Textarea value={form?.planDescription ?? ''} onChange={(e: any) => update('planDescription', e?.target?.value ?? '')} rows={2} placeholder="Detalles del plano..." />
          </div>
          <div className="md:col-span-2">
            <Label>Ubicación Detallada</Label>
            <Textarea value={form?.locationDetail ?? ''} onChange={(e: any) => update('locationDetail', e?.target?.value ?? '')} rows={2} placeholder="Descripción de la ubicación, barrio, cercanías..." />
          </div>
          <div className="md:col-span-2">
            <Label>URL Google Maps Embed (opcional)</Label>
            <Input value={form?.locationMapUrl ?? ''} onChange={(e: any) => update('locationMapUrl', e?.target?.value ?? '')} placeholder="https://lh3.googleusercontent.com/SkttDT19UFL0QQ6ZUdWspO8DOAVE573O1_j5iEQQcNMzSOpx_95hDsRq0uqR24NGpoQq3VeewhqqA4ZcWe8f3JlADvWTPgCp4cx6j2uT=s0" />
          </div>
          <div>
            <Label>Tiempo de Entrega (días)</Label>
            <Input type="number" value={form?.deliveryTimeDays ?? 45} onChange={(e: any) => update('deliveryTimeDays', e?.target?.value ?? 45)} />
          </div>
          <div>
            <Label>Nota de Entrega</Label>
            <Input value={form?.deliveryTimeNote ?? ''} onChange={(e: any) => update('deliveryTimeNote', e?.target?.value ?? '')} placeholder="Desde la reserva" />
          </div>
          <div className="md:col-span-2">
            <Label>Detalle Simulación de Financiación</Label>
            <Textarea value={form?.financingSimDetail ?? ''} onChange={(e: any) => update('financingSimDetail', e?.target?.value ?? '')} rows={3} placeholder="Detalle de las opciones de financiación..." />
          </div>
          {/* FAQ Editor */}
          <div className="md:col-span-2">
            <Label>Preguntas Frecuentes</Label>
            <div className="space-y-2 mt-2">
              {faqList.map((faq, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    <Input value={faq.q} onChange={(e: any) => { const n = [...faqList]; n[idx] = { ...n[idx], q: e.target.value }; setFaqList(n); }} placeholder="Pregunta" />
                    <Input value={faq.a} onChange={(e: any) => { const n = [...faqList]; n[idx] = { ...n[idx], a: e.target.value }; setFaqList(n); }} placeholder="Respuesta" />
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="text-red-500 mt-1" onClick={() => setFaqList(faqList.filter((_, i) => i !== idx))}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setFaqList([...faqList, { q: '', a: '' }])}>
                + Agregar Pregunta
              </Button>
            </div>
          </div>

          {isEdit && (
            <div className="md:col-span-2 space-y-4">
              <div className="border-t pt-4">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Fotos y Videos de la Propiedad
                </Label>
                <p className="text-sm text-muted-foreground mt-1 mb-3">Formatos: PNG, JPG, MP4 — Máximo 10 MB por archivo</p>
                <div className="flex items-center gap-3">
                  <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.mp4" multiple onChange={handleFileSelect} className="hidden" id="media-upload" />
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="border-dashed border-2 hover:border-primary hover:bg-primary/5">
                    {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Subiendo...</> : <><Upload className="w-4 h-4 mr-2" /> Seleccionar Archivos</>}
                  </Button>
                  {uploadProgress && <span className="text-sm text-muted-foreground">{uploadProgress}</span>}
                </div>
                {mediaFiles.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-4">
                    {mediaFiles.map((media: any) => (
                      <div key={media.id} className="relative group rounded-lg overflow-hidden border bg-muted">
                        {media.mediaType === 'video' ? (
                          <div className="aspect-square flex items-center justify-center bg-gray-900">
                            <video src={getMediaUrl(media)} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="bg-black/50 rounded-full p-2"><Video className="w-5 h-5 text-white" /></div></div>
                          </div>
                        ) : (
                          <div className="relative aspect-square bg-gray-200"><Image src={getMediaUrl(media)} alt={media.fileName ?? 'Foto de propiedad'} fill className="object-cover" /></div>
                        )}
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button type="button" size="sm" variant="destructive" className="h-7 w-7 p-0" onClick={() => deleteMedia(media.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                          <p className="text-xs text-white truncate">{media.fileName}</p>
                          <div className="flex items-center gap-1">
                            {media.mediaType === 'video' ? <Video className="w-3 h-3 text-primary" /> : <ImageIcon className="w-3 h-3 text-primary" />}
                            <span className="text-[10px] text-gray-300">{(media.fileSize / 1024 / 1024).toFixed(1)} MB</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {mediaFiles.length === 0 && (
                  <div className="mt-4 border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
                    <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No hay fotos ni videos todavía</p>
                    <p className="text-xs mt-1">Hacé clic en &ldquo;Seleccionar Archivos&rdquo; para agregar</p>
                  </div>
                )}
              </div>
            </div>
          )}
          {!isEdit && (
            <div className="md:col-span-2">
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                <p className="text-sm text-primary">💡 Guardá la propiedad primero y luego podrás subir fotos y videos.</p>
              </div>
            </div>
          )}
          <div className="md:col-span-2 flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Save className="w-4 h-4 mr-1" /> {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
