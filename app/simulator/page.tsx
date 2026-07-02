export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { SimulatorContent } from './_components/simulator-content';

export default async function SimulatorPage() {
  const [properties, combinations, colors, revestimientos] = await Promise.all([
    prisma.property.findMany({
      where: { active: true },
      select: { id: true, address: true, surface: true, bedrooms: true, bathrooms: true, media: { take: 1, orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.simulatorCombination.findMany({
      include: { property: { select: { id: true, address: true } } },
      orderBy: [{ sortOrder: 'asc' }],
    }),
    prisma.simulatorColor.findMany({ orderBy: [{ sortOrder: 'asc' }] }),
    prisma.simulatorRevestimiento.findMany({ orderBy: [{ sortOrder: 'asc' }] }),
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <SimulatorContent
        properties={JSON.parse(JSON.stringify(properties))}
        combinations={JSON.parse(JSON.stringify(combinations))}
        colors={JSON.parse(JSON.stringify(colors))}
        revestimientos={JSON.parse(JSON.stringify(revestimientos))}
      />
      <Footer />
    </div>
  );
}
