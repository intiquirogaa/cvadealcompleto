import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { CRMContent } from './_components/crm-content';

export const dynamic = 'force-dynamic';

export default function CRMPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <CRMContent />
      <Footer />
    </div>
  );
}
