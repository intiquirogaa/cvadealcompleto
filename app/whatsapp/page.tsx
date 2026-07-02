import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { WhatsAppQRConnect } from '@/components/whatsapp-qr-connect';
import { WhatsAppChat } from '@/components/whatsapp-chat';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const dynamic = 'force-dynamic';

export default function WhatsAppPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-display font-bold tracking-tight mb-2">
            WhatsApp Integrado
          </h1>
          <p className="text-muted-foreground">
            Gestiona tus conversaciones de WhatsApp directamente desde la plataforma
          </p>
        </div>

        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="connect">Conectar</TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="mt-0">
            <WhatsAppChat />
          </TabsContent>

          <TabsContent value="connect" className="mt-0">
            <div className="flex items-center justify-center">
              <WhatsAppQRConnect />
            </div>
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}
