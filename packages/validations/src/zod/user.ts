import z from "zod";

export const OnRampSchema = z.object({
    assetId: z.string("Asset Id has to be proper string"),
    amount: z.string("Amount needs to be in valid format").min(1).regex(/^\d*\.?\d*$/, {
        message: "Only numbers and a single decimal point are allowed",
    })
})