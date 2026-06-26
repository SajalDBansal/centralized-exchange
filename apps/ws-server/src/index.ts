import "dotenv/config";
import { createServer } from "node:http";
import { createMarketDataGateway } from "./gateway";
import { connectRedisMarketDataSubscriber, type RedisMarketDataSubscription } from "./redis";

const port = resolvePort();
const wsPath = process.env.WS_PATH || "/ws";

const server = createServer((request, response) => {
    if (request.url === "/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ success: true, message: "ws-server healthy" }));
        return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ success: false, message: "Not found" }));
});

const gateway = createMarketDataGateway({ server, path: wsPath });
let redisSubscription: RedisMarketDataSubscription | undefined;

connectRedisMarketDataSubscriber(gateway)
    .then((subscription) => {
        redisSubscription = subscription;
        console.log(`Subscribed to Redis engine result stream`);
    })
    .catch((error) => {
        console.error("Failed to subscribe to Redis engine result stream", error);
    });

server.listen(port, () => {
    console.log(`WebSocket market data server running on ${port}${wsPath}`);
});

const shutdown = async () => {
    await redisSubscription?.close().catch((error) => {
        console.error("Failed to close Redis engine result subscription", error);
    });

    await gateway.close().catch((error) => {
        console.error("Failed to close websocket gateway", error);
    });

    server.close(() => process.exit(0));
};

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

function resolvePort() {
    const raw = process.env.WS_PORT || process.env.PORT || "8081";
    const parsed = Number(raw);

    if (!Number.isInteger(parsed) || parsed <= 0 || parsed >= 65_536) {
        throw new Error(`WS_PORT must be an integer between 1 and 65535. Received: ${raw}`);
    }

    return parsed;
}
