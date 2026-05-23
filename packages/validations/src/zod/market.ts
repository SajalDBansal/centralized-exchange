import z from "zod";

export const GetMarketByIdClientSchema = z.object({
    marketId: z.string()
});

export const AddMarketAssetClientSchema = z.object({
    userId: z.string(),
    asset: z.object({
        symbol: z.string(),
        precision: z.number()
    }),
    assetSide: z.enum(["base", "quote"])
});

export const AddMarketClientSchema = z.object({
    userId: z.string(),
    market: z.object({
        name: z.string(),
        baseAssetId: z.string(),
        quoteAssetId: z.string(),
        maxLeverage: z.number(),
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
        baseAssetId: z.string().optional(),
        quoteAssetId: z.string().optional(),
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