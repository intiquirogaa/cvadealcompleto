import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { CheckoutContent } from './_components/checkout-content';

export default function CheckoutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <CheckoutContent />
      <Footer />
    </div>
  );
}
