import z from "zod";
import { OrderSide, OrderType, STPMode, TimeInForce, type MarketSymbolType } from "@workspace/types"

export const markets: MarketSymbolType[] = ["BTC_INR", "BTC_USD", "ETH_INR", "ETH_USD", "SOL_INR", "SOL_USD"] as const;

export const CreateOrderClientSchema = z.object({
    market: z.enum(markets, "Provide a valid market Name"),
    price: z.string("Price should be a valid number").regex(/^\d*\.?\d*$/, {
        message: "Only numbers and a single decimal point are allowed",
    }),
    quantity: z.string("Quantity should be a valid number").regex(/^\d*\.?\d*$/, {
        message: "Only numbers and a single decimal point are allowed",
    }),
    leverage: z.number("Quantity should be a valid number").optional(),
    side: z.enum([OrderSide.BUY, OrderSide.SELL]),
    type: z.enum([OrderType.LIMIT, OrderType.MARKET]),
    postOnly: z.boolean().optional(),
    reduceOnly: z.boolean().optional(),
    stpMode: z.enum([STPMode.CANCEL_BOTH, STPMode.CANCEL_MAKER, STPMode.CANCEL_TAKER]).optional(),
    timeInForce: z.enum([TimeInForce.FOK, TimeInForce.GTC, TimeInForce.IOC]).optional(),
});

export const CancelOrGetOrderClientSchema = z.object({
    orderId: z.string("Need a proper orderId"),
});

export const GetOpenOrdersClientSchema = z.object({
    market: z.enum(markets)
});