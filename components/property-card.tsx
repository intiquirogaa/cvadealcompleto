'use client';
import React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Maximize2, Calendar, DollarSign, BedDouble, Bath, Building2, TrendingUp, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface PropertyCardProps {
  property: any;
  index?: number;
}

function getUploadedMediaUrl(path: string) {
  return 'https://abacusai-apps-f27519269f5a38e35ae8fccd-us-west-2.s3.us-west-2.amazonaws.com/' + path;
}

export function PropertyCard({ property, index = 0 }: PropertyCardProps) {
  const router = useRouter();
  const uploadedImg = property?.media?.find((m: any) => m.mediaType === 'image');
  const img = uploadedImg
    ? getUploadedMediaUrl(uploadedImg.cloudStoragePath)
    : (property?.images?.[0] ?? '');

  // Badge logic
  const isNew = property?.createdAt && (Date.now() - new Date(property.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000;
  const isPopular = (property?.viewCount ?? 0) > 50;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (index ?? 0) * 0.08, duration: 0.4 }}
    >
      <Card className="overflow-hidden group cursor-pointer border-0 shadow-md hover:shadow-xl transition-all duration-300"
        onClick={() => router.push(`/properties/${property?.id ?? ''}`)}>
        <div className="relative aspect-[16/10] bg-muted overflow-hidden">
          {img ? (
            <Image src={img} alt={property?.constructionStyle ?? 'Propiedad'} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">Sin imagen</div>
          )}
          <Badge className="absolute top-3 left-3 bg-orange-500 text-white font-semibold border-0">
            ARS ${(property?.price ?? 0).toLocaleString('es-AR')}
          </Badge>
          <Badge className="absolute top-3 right-3 bg-black/70 dark:bg-white/20 text-white border-0">
            {property?.financingStatus ?? 'Consultar'}
          </Badge>
          {isNew && (
            <Badge className="absolute bottom-3 left-3 bg-green-500 text-white border-0">
              <Sparkles className="w-3 h-3 mr-1" /> Nuevo
            </Badge>
          )}
          {isPopular && (
            <Badge className="absolute bottom-3 right-3 bg-orange-600 text-white border-0">
              <TrendingUp className="w-3 h-3 mr-1" /> Más consultado
            </Badge>
          )}
        </div>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-bold text-lg tracking-tight line-clamp-1">
            {property?.constructionStyle ?? 'Estilo no especificado'}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2">{property?.description ?? ''}</p>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Maximize2 className="w-3.5 h-3.5" /> {property?.surface ?? 0}m² </span>
            <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" /> {property?.bedrooms ?? 0}</span>
            <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" /> {property?.bathrooms ?? 0}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {property?.age ?? 0} años</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-xs text-muted-foreground">{property?.constructionCompany ?? 'Sin especificar'}</span>
            </div>
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={(e: React.MouseEvent) => { e?.stopPropagation?.(); router.push(`/properties/${property?.id ?? ''}`); }}>
              <DollarSign className="w-3.5 h-3.5 mr-1" />
              Asesoría ${(property?.consultingPrice ?? 0).toLocaleString('es-AR')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
