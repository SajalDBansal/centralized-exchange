import z from "zod";

export const RegisterUserSchema = z.object({
    username: z.string("Username must be a valid string")
        .trim()
        .min(3, "Username have minimum length of 3"),
    email: z.email("Email must be in proper format"),
    password: z.string("Password must be a valid string")
        .min(8, "Password must be of atleast 8 digits")
        .regex(/[A-Z]/, "Must include uppercase letter")
        .regex(/[0-9]/, "Must include a number"),
    confirmPassword: z.string().min(8),
}).refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: "Password do not match",
    path: ["confirmPassword"]
});

export const LoginUserSchema = z.object({
    username: z.string("Username must be a valid string")
        .trim()
        .min(3, "Username have minimum length of 3"),
    password: z.string("Password must be a valid string")
        .min(8, "Password must be of atleast 8 digits"),
});