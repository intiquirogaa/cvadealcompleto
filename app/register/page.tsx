import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { RegisterForm } from './_components/register-form';

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <RegisterForm />
      <Footer />
    </div>
  );
}
