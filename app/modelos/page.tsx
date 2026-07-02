import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { prisma } from '@/lib/db';
import { ModelosContent } from './_components/modelos-content';

export const dynamic = 'force-dynamic';

export default async function ModelosPage() {
  const constructors = await prisma.constructor.findMany({
    where: { active: true },
    include: { properties: { where: { active: true }, select: { id: true } } },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <ModelosContent constructors={JSON.parse(JSON.stringify(constructors))} />
      <Footer />
    </div>
  );
}
