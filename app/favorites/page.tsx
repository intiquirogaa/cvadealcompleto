import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { FavoritesContent } from './_components/favorites-content';

export const dynamic = 'force-dynamic';

export default function FavoritesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <FavoritesContent />
      <Footer />
    </div>
  );
}
