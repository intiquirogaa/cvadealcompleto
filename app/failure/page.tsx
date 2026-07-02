import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { FailureContent } from './_components/failure-content';

export default function FailurePage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <FailureContent />
      <Footer />
    </div>
  );
}
