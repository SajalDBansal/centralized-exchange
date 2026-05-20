import z from "zod";

export const GetMarketsClientSchema = z.object({
    userId: z.string()
});

export const GetMarketByIdClientSchema = z.object({
    userId: z.string(),
    marketId: z.string()
});

export const AddMarketClientSchema = z.object({
    userId: z.string(),
    market: z.object({
        id: z.string(),
        name: z.string(),
        baseAsset: z.string(),
        quoteAsset: z.string(),
        maxLeverage: z.number(),
        precision: z.number(),
        minQty: z.number(),
        tickSize: z.number(),
        lotSize: z.number(),
        minNotional: z.number()
    })
});

export const UpdateMarketClientSchema = z.object({
    userId: z.string(),
    marketId: z.string(),
    market: z.object({
        name: z.string().optional(),
        baseAsset: z.string().optional(),
        quoteAsset: z.string().optional(),
        maxLeverage: z.number().optional(),
        precision: z.number().optional(),
        minQty: z.number().optional(),
        tickSize: z.number().optional(),
        lotSize: z.number().optional(),
        minNotional: z.number().optional()
    })
});

export const DeleteMarketClientSchema = z.object({
    userId: z.string(),
    marketId: z.string()
});