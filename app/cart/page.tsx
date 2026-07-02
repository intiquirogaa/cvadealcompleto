import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { CartContent } from './_components/cart-content';

export default function CartPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <CartContent />
      <Footer />
    </div>
  );
}
