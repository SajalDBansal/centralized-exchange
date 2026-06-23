import z from "zod";
import { MarketType, OrderPosition, OrderSide, OrderType, STPMode, TimeInForce } from "@workspace/types"

export const CreateOrderClientSchema = z.object({
    marketId: z.string("Provide a valid market Name"),
    entryPrice: z.string("Price should be a valid number").regex(/^\d*\.?\d*$/, {
        message: "Only numbers and a single decimal point are allowed",
    }),
    quantity: z.string("Quantity should be a valid number").regex(/^\d*\.?\d*$/, {
        message: "Only numbers and a single decimal point are allowed",
    }),
    leverage: z.number("Leverage should be a valid number"),
    side: z.enum([OrderSide.BUY, OrderSide.SELL]),
    marketType: z.enum([MarketType.PERP, MarketType.SPOT]),
    type: z.enum([OrderType.LIMIT, OrderType.MARKET]),
    position: z.enum([OrderPosition.LONG, OrderPosition.SHORT]).optional(),
    postOnly: z.boolean(),
    reduceOnly: z.boolean(),
    stpMode: z.enum([STPMode.CANCEL_BOTH, STPMode.CANCEL_MAKER, STPMode.CANCEL_TAKER]),
    timeInForce: z.enum([TimeInForce.FOK, TimeInForce.GTC, TimeInForce.IOC]),
});

export const CancelOrGetOrderClientSchema = z.object({
    orderId: z.string("Need a proper orderId"),
});

export const GetOpenOrdersClientSchema = z.object({
    marketId: z.string("Provide a valid market Name"),
});
