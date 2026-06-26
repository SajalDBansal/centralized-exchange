import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import("http-proxy-middleware");
import type { ErrorRequestHandler } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();

app.set("trust proxy", 1);

const PORT = Number(process.env.PORT || 8080);
const BACKPACK_REST_URL = process.env.BACKPACK_REST_URL || "https://api.backpack.exchange";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === "true";

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);

const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 300);

app.use(cors(
  {
    origin(origin, callback) {
      // Allow server-to-server requests, curl, Postman, health checks, etc.
      if (!origin) { return callback(null, true); }

      if (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Timestamp",
      "X-Window",
      "X-API-Key",
      "X-Signature"
    ],
    maxAge: 86400
  }
));

app.use(helmet({ crossOriginResourcePolicy: false }));

app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/", (req, res) => {
  res.json({
    service: "Backpack Exchange Proxy",
    status: "ok",
    health: "/health",
    proxyBasePath: "/api/backpack"
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    upstream: BACKPACK_REST_URL,
    timestamp: new Date().toISOString()
  });
});

const proxyRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests to proxy. Please slow down."
  }
});

app.use("/api/backpack", proxyRateLimiter);

/**
 * Safety guard:
 * By default this proxy only allows public/read-only requests from your frontend.
 *
 * Public Backpack market data usually uses GET.
 * Private trading/account endpoints may require signed headers.
 * Do not expose Backpack API secrets in frontend code.
 */
app.use("/api/backpack", (req, res, next) => {
  const safeMethods = ["GET", "HEAD", "OPTIONS"];

  if (!ALLOW_MUTATIONS && !safeMethods.includes(req.method)) {
    return res.status(405).json({
      error: "Only read-only public requests are allowed by this proxy.",
      fix: "Set ALLOW_MUTATIONS=true only if you fully understand the security risk and handle authentication server-side."
    });
  }

  return next();
});

/**
 * Important:
 * Do not use express.json() before this proxy route.
 * The proxy should receive the raw request stream.
 */
app.use("/api/backpack", createProxyMiddleware({
  target: BACKPACK_REST_URL,
  changeOrigin: true,
  secure: true,
  xfwd: true,

  /**
   * Frontend calls:
   *   /api/backpack/api/v1/markets
   *
   * Upstream receives:
   *   https://api.backpack.exchange/api/v1/markets
   */
  pathRewrite: { "^/api/backpack": "" },

  on: {
    proxyReq(proxyReq) {
      proxyReq.setHeader("User-Agent", "backpack-proxy-server/1.0");
    },

    proxyRes(proxyRes) {
      /**
       * Optional: remove upstream headers you do not want to expose.
       * Keep this minimal unless you have a reason.
       */
      delete proxyRes.headers["x-powered-by"];
    },

    error(error, req, res) {
      console.error("Proxy error:", error);

      if ("headersSent" in res && !res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: "Bad gateway while contacting Backpack Exchange API."
        }));
      }
    }
  }
})
);

const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err.message?.startsWith("CORS blocked")) {
    return res.status(403).json({
      error: err.message
    });
  }

  console.error("Server error:", err);

  return res.status(500).json({
    error: "Internal server error"
  });
};

app.use(errorHandler);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backpack proxy running on port ${PORT}`);
  console.log(`Proxying /api/backpack/* -> ${BACKPACK_REST_URL}/*`);
});
