import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { BlogContent } from './_components/blog-content';

export const dynamic = 'force-dynamic';

export default function BlogPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <BlogContent />
      <Footer />
    </div>
  );
}
