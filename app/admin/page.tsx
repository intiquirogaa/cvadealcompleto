import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { AdminContent } from './_components/admin-content';

export default function AdminPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <AdminContent />
      <Footer />
    </div>
  );
}
