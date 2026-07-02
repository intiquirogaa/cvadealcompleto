import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { CompareContent } from './_components/compare-content';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function ComparePage() {
  let properties: any[] = [];
  try {
    properties = await prisma.property.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' }, include: { media: { orderBy: { sortOrder: 'asc' } } } });
  } catch (e) { console.error(e); }
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <CompareContent properties={JSON.parse(JSON.stringify(properties))} />
      <Footer />
    </div>
  );
}
