import z from "zod";
import { MarketType, OrderSide, OrderType, STPMode, TimeInForce } from "@workspace/types"

export const CreateOrderClientSchema = z.object({
    marketId: z.string("Provide a valid market Name"),
    entryPrice: z.string("Price should be a valid number").regex(/^\d*\.?\d*$/, {
        message: "Only numbers and a single decimal point are allowed",
    }),
    quantity: z.string("Quantity should be a valid number").regex(/^\d*\.?\d*$/, {
        message: "Only numbers and a single decimal point are allowed",
    }),
    margin: z.string("Quantity should be a valid number").regex(/^\d*\.?\d*$/, {
        message: "Only numbers and a single decimal point are allowed",
    }),
    leverage: z.number("Quantity should be a valid number"),
    side: z.enum([OrderSide.LONG, OrderSide.SHORT]),
    marketType: z.enum([MarketType.PERP, MarketType.SPOT]),
    type: z.enum([OrderType.LIMIT, OrderType.MARKET]),
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