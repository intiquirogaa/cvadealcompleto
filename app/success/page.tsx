import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { SuccessContent } from './_components/success-content';

export default function SuccessPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <SuccessContent />
      <Footer />
    </div>
  );
}
