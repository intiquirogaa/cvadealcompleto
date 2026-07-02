import { prisma } from '@/lib/db';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { HomeContent } from './_components/home-content';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let properties: any[] = [];
  let statsPopups: any[] = [];
  try {
    [properties, statsPopups] = await Promise.all([
      prisma.property.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
        include: { media: { orderBy: { sortOrder: 'asc' } } },
      }),
      prisma.statsPopup.findMany({ where: { section: 'home' }, orderBy: { sortOrder: 'asc' } }),
    ]);
  } catch (e: any) {
    console.error(e);
  }
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <HomeContent properties={JSON.parse(JSON.stringify(properties ?? []))} statsPopups={JSON.parse(JSON.stringify(statsPopups ?? []))} />
      <Footer />
    </div>
  );
}
