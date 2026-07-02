import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { MessageCircle, Mail, MapPin, Phone } from 'lucide-react';

export default function ContactoPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-16">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h1 className="text-3xl sm:text-4xl font-black mb-4">Contacto</h1>
            <p className="text-muted-foreground">¿Tenés dudas? Contactá a nuestro equipo de asesores.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {[
              { icon: Mail, title: 'Email', value: 'cvalearning@gmail.com', href: 'mailto:cvalearning@gmail.com' },
              { icon: MessageCircle, title: 'WhatsApp', value: 'Enviar mensaje', href: 'https://wa.me/' },
              { icon: MapPin, title: 'Ubicación', value: 'Neuquén, Argentina', href: '#' },
            ].map((c, i) => (
              <a key={i} href={c.href} target="_blank" rel="noopener noreferrer" className="bg-card border border-border rounded-xl p-6 text-center hover:border-orange-500/50 transition-colors block">
                <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <c.icon className="w-6 h-6 text-orange-500" />
                </div>
                <h3 className="font-bold mb-1">{c.title}</h3>
                <p className="text-sm text-muted-foreground">{c.value}</p>
              </a>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
