import dotenv from "dotenv";
dotenv.config();

if (!process.env.JWT_REFRESH_TOKEN || !process.env.JWT_ACCESS_TOKEN) {
    throw new Error('JWT_SECRET is not set');
}

const config = {
    BCRYPT_HASH: process.env.BCRYPT_HASH || 10,
    JWT_REFRESH_TOKEN: process.env.JWT_REFRESH_TOKEN,
    JWT_ACCESS_TOKEN: process.env.JWT_ACCESS_TOKEN,
    NODE_ENV: process.env.NODE_ENV || "development",
}

export default config;