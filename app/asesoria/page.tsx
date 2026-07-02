export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { AsesoriaContent } from './_components/asesoria-content';

export default async function AsesoriaPage() {
  const profiles = await prisma.advisorProfile.findMany({
    where: { active: true },
    include: { user: { select: { name: true, email: true, phone: true, image: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <AsesoriaContent advisors={JSON.parse(JSON.stringify(profiles))} />
      <Footer />
    </div>
  );
}
