import { PrismaClient } from '@prisma/client';

// Prisma 7.x configuration for SQLite
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

export default prisma;