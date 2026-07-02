import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { prisma } from '@/lib/db';
import { EntregasContent } from './_components/entregas-content';

export const dynamic = 'force-dynamic';

export default async function EntregasPage() {
  const [posts, statsPopups] = await Promise.all([
    prisma.blogPost.findMany({
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      include: { constructorRef: true },
    }),
    prisma.statsPopup.findMany({ where: { section: 'entregas' }, orderBy: { sortOrder: 'asc' } }),
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <EntregasContent posts={JSON.parse(JSON.stringify(posts))} statsPopups={JSON.parse(JSON.stringify(statsPopups ?? []))} />
      <Footer />
    </div>
  );
}
