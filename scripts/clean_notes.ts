import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();

async function cleanNotes() {
  const clients = await prisma.cRMClient.findMany({
    where: {
      notes: {
        contains: '[IA OSINT',
      }
    }
  });

  console.log(`Found ${clients.length} clients with IA OSINT in notes.`);

  for (const client of clients) {
    if (!client.notes) continue;
    
    // Split notes by line and filter out any lines that start with [IA OSINT
    const cleanNotes = client.notes
      .split('\n')
      .filter(line => !line.trim().startsWith('[IA OSINT'))
      .join('\n')
      .trim();
    
    await prisma.cRMClient.update({
      where: { id: client.id },
      data: { notes: cleanNotes }
    });
    console.log(`Cleaned notes for client ${client.id}`);
  }
}

cleanNotes()
  .then(() => console.log("Done!"))
  .catch(console.error)
  .finally(() => prisma.$disconnect());
