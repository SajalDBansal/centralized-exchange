import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
export {
    AssetTransactionStatus,
    AssetTransactionType,
    FillStatus,
    MarketType,
    OrderPosition,
    OrderStatus,
    OrderType,
    STPMode,
    TimeInForce,
    TradeSide,
} from "./generated/prisma/client";

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
});

export const prisma = new PrismaClient({ adapter });
