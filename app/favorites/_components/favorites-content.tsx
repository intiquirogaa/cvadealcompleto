'use client';
import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { PropertyCard } from '@/components/property-card';
import { Heart } from 'lucide-react';

export function FavoritesContent() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    if (status === 'authenticated') {
      fetch('/api/favorites').then(r => r.json()).then(d => setFavorites(d ?? [])).catch(() => {}).finally(() => setLoading(false));
    }
  }, [status]);

  if (loading) return <main className="flex-1 flex items-center justify-center py-20"><p className="text-muted-foreground">Cargando...</p></main>;

  return (
    <main className="flex-1">
      <div className="max-w-[1200px] mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-8">
          <Heart className="w-6 h-6 text-orange-500" />
          <h1 className="text-2xl font-bold">Mis Favoritos</h1>
        </div>
        {favorites.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {favorites.map((f: any, i: number) => <PropertyCard key={f.id} property={f.property} index={i} />)}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Heart className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No tenés favoritos todavía</p>
            <p className="text-sm">Guardá propiedades que te interesen desde el catálogo</p>
          </div>
        )}
      </div>
    </main>
  );
}
