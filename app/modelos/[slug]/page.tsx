import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { ConstructorModelsContent } from './_components/constructor-models-content';

export const dynamic = 'force-dynamic';

export default async function ConstructorModelsPage({ params }: { params: { slug: string } }) {
  const constructor = await prisma.constructor.findUnique({
    where: { slug: params.slug },
    include: {
      properties: {
        where: { active: true },
        include: { media: { orderBy: { sortOrder: 'asc' } }, favorites: { select: { id: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!constructor) return notFound();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <ConstructorModelsContent constructor={JSON.parse(JSON.stringify(constructor))} />
      <Footer />
    </div>
  );
}
