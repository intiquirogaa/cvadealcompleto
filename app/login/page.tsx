import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { LoginForm } from './_components/login-form';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <LoginForm />
      <Footer />
    </div>
  );
}
