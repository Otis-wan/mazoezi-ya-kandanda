import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { loadDrills } from './drill-data.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

try {
  const drills = loadDrills();
  await prisma.$transaction(
    drills.map(({ id, data }) =>
      prisma.drill.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      }),
    ),
  );
  console.log(`Seeded ${drills.length} drills`);
} finally {
  await prisma.$disconnect();
}