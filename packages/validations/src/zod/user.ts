import z from "zod";

export const OnRampSchema = z.object({
    asset: z.enum(["BTC", "ETH", "SOL", "INR", "USD"], "Asset have to be of BTC, ETH, SOL, INR or USD"),
    amount: z.string("Amount needs to be in valid format").min(1).regex(/^\d*\.?\d*$/, {
        message: "Only numbers and a single decimal point are allowed",
    })
})