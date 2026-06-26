import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "@jest/globals";
import WebSocket from "ws";
import { createMarketDataGateway, type MarketDataGateway } from "./gateway";
import { streamKey, type DepthUpdateEvent } from "@workspace/types";

describe("market data websocket gateway", () => {
    let server: Server | undefined;
    let gateway: MarketDataGateway | undefined;
    let client: WebSocket | undefined;

    afterEach(async () => {
        client?.close();
        await gateway?.close().catch(() => undefined);

        if (server?.listening) {
            await new Promise<void>((resolve) => server?.close(() => resolve()));
        }
    });

    it("fans out market updates only to subscribed sockets", async () => {
        server = createServer();
        gateway = createMarketDataGateway({ server });
        const port = await listen(server);

        client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const ready = nextJson(client);
        await waitForOpen(client);

        expect(await ready).toMatchObject({
            type: "connection.ready",
            protocol: "market-data.v1",
        });

        const subscribed = nextJson(client);
        client.send(JSON.stringify({
            type: "subscribe",
            marketId: "BTC_INR",
            stream: ["depth", "ticker"],
        }));

        expect(await subscribed).toMatchObject({
            type: "subscribed",
            streams: ["depth:BTC_INR", "ticker:BTC_INR"],
        });

        expect(gateway.getSubscriptionCount(streamKey("depth", "BTC_INR"))).toBe(1);

        const update: DepthUpdateEvent = {
            type: "depth.update",
            stream: "depth",
            marketId: "BTC_INR",
            eventTs: Date.now(),
            seq: 42,
            data: {
                bids: [{ price: "99", quantity: "1" }],
                asks: [{ price: "101", quantity: "1" }],
            },
        };

        const depthUpdate = nextJson(client);
        expect(gateway.publishToLocalClients(update)).toBe(1);
        expect(await depthUpdate).toMatchObject({
            type: "depth.update",
            marketId: "BTC_INR",
            seq: 42,
        });

        const unsubscribed = nextJson(client);
        client.send(JSON.stringify({
            type: "unsubscribe",
            marketId: "BTC_INR",
            stream: "depth",
        }));

        expect(await unsubscribed).toMatchObject({
            type: "unsubscribed",
            streams: ["depth:BTC_INR"],
        });

        expect(gateway.getSubscriptionCount(streamKey("depth", "BTC_INR"))).toBe(0);
        expect(gateway.publishToLocalClients(update)).toBe(0);
    });

    it("handles ping, malformed messages, and explicit stream keys", async () => {
        server = createServer();
        gateway = createMarketDataGateway({ server });
        const port = await listen(server);

        client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const ready = nextJson(client);
        await waitForOpen(client);
        await ready;

        const pong = nextJson(client);
        client.send(JSON.stringify({ type: "ping" }));
        expect(await pong).toMatchObject({ type: "pong" });

        const invalidJson = nextJson(client);
        client.send("not-json");
        expect(await invalidJson).toMatchObject({
            type: "error",
            message: "Invalid websocket message",
        });

        const invalidStreams = nextJson(client);
        client.send(JSON.stringify({
            type: "subscribe",
            streams: ["depth:BTC_INR:extra", "unknown:BTC_INR"],
        }));
        expect(await invalidStreams).toMatchObject({
            type: "error",
            message: "No valid market streams provided",
        });

        const subscribed = nextJson(client);
        client.send(JSON.stringify({
            type: "subscribe",
            streams: ["depth:btc_inr", "price:BTC_INR", "depth:BTC_INR"],
        }));
        expect(await subscribed).toMatchObject({
            type: "subscribed",
            streams: ["depth:BTC_INR", "price:BTC_INR"],
        });
        expect(gateway.getSubscriptionCount(streamKey("price", "BTC_INR"))).toBe(1);
        expect(gateway.getSubscriptionCount(streamKey("depth", "BTC_INR"))).toBe(1);
    });
});

function listen(server: Server) {
    return new Promise<number>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            resolve((server.address() as AddressInfo).port);
        });
    });
}

function waitForOpen(socket: WebSocket) {
    return new Promise<void>((resolve, reject) => {
        socket.once("open", () => resolve());
        socket.once("error", reject);
    });
}

function nextJson(socket: WebSocket) {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timed out waiting for websocket message")), 1000);

        socket.once("message", (message) => {
            clearTimeout(timeout);
            resolve(JSON.parse(message.toString()) as Record<string, unknown>);
        });

        socket.once("error", reject);
    });
}
