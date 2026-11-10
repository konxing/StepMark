import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** Use a single pooled adapter per Node.js process, including hot reload. */
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to access private data");
  const adapter = new PrismaPg({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 6),
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 20000,
    maxUses: 10000
  });
  return new PrismaClient({ adapter, log: ["error"] });
}
const globalState = globalThis as unknown as { stepmarkPrisma?: PrismaClient };
export function getDb(): PrismaClient {
  if (!globalState.stepmarkPrisma) globalState.stepmarkPrisma = createClient();
  return globalState.stepmarkPrisma;
}
