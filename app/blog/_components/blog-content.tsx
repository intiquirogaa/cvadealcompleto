'use client';
import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Calendar, User } from 'lucide-react';
import { motion } from 'framer-motion';

export function BlogContent() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<any>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    if (status === 'authenticated') {
      fetch('/api/blog').then(r => r.json()).then(d => setPosts(d ?? [])).catch(() => {}).finally(() => setLoading(false));
    }
  }, [status]);

  if (loading) return <main className="flex-1 flex items-center justify-center py-20"><p className="text-muted-foreground">Cargando...</p></main>;

  if (selectedPost) {
    return (
      <main className="flex-1">
        <div className="max-w-[800px] mx-auto px-4 py-8">
          <button onClick={() => setSelectedPost(null)} className="text-orange-500 text-sm mb-4 hover:underline">&larr; Volver a novedades</button>
          <h1 className="text-3xl font-bold mb-4">{selectedPost.title}</h1>
          <div className="flex gap-3 text-sm text-muted-foreground mb-8">
            <span className="flex items-center gap-1"><User className="w-3 h-3" /> {selectedPost.author}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(selectedPost.createdAt).toLocaleDateString('es-AR')}</span>
            <Badge variant="outline" className="border-orange-500/30 text-orange-500">{selectedPost.category}</Badge>
          </div>
          <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: selectedPost.content.replace(/\n/g, '<br/>') }} />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="max-w-[1200px] mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-8">
          <BookOpen className="w-6 h-6 text-orange-500" />
          <h1 className="text-2xl font-bold">Entregas y Novedades</h1>
        </div>
        {posts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post: any, i: number) => (
              <motion.div key={post.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                <Card className="cursor-pointer hover:shadow-lg transition-shadow border-0 shadow-md" onClick={() => setSelectedPost(post)}>
                  <CardContent className="p-5">
                    <Badge variant="outline" className="border-orange-500/30 text-orange-500 mb-3">{post.category}</Badge>
                    <h3 className="font-bold text-lg mb-2 line-clamp-2">{post.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-4">{post.excerpt}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" /> {post.author}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(post.createdAt).toLocaleDateString('es-AR')}</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No hay novedades publicadas aún</p>
          </div>
        )}
      </div>
    </main>
  );
}
