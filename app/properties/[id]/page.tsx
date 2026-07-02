import { prisma } from '@/lib/db';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { PropertyDetail } from './_components/property-detail';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PropertyPage({ params }: { params: { id: string } }) {
  let property: any = null;
  try {
    property = await prisma.property.findUnique({
      where: { id: params?.id },
      include: { media: { orderBy: { sortOrder: 'asc' } } },
    });
  } catch (e: any) {
    console.error(e);
  }
  if (!property) return notFound();
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <PropertyDetail property={JSON.parse(JSON.stringify(property))} />
      <Footer />
    </div>
  );
}
