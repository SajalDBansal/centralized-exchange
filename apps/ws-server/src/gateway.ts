import type { Server as HttpServer } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import {
    type MarketDataEvent,
    type MarketStream,
    isMarketStream,
    parseStreamKey,
    streamKey,
} from "@workspace/types";

type SubscribeMessage = {
    type: "subscribe";
    streams?: string[];
    marketId?: string;
    stream?: MarketStream | MarketStream[];
};

type UnsubscribeMessage = {
    type: "unsubscribe";
    streams?: string[];
    marketId?: string;
    stream?: MarketStream | MarketStream[];
};

type ClientMessage =
    | SubscribeMessage
    | UnsubscribeMessage
    | { type: "ping" };

export type MarketDataGateway = {
    wss: WebSocketServer;
    publishToLocalClients: (event: MarketDataEvent) => number;
    close: () => Promise<void>;
    getSubscriptionCount: (key: string) => number;
};

export const createMarketDataGateway = ({
    server,
    path = "/ws",
}: {
    server: HttpServer;
    path?: string;
}): MarketDataGateway => {
    const wss = new WebSocketServer({ server, path });
    const subscriptionsBySocket = new Map<WebSocket, Set<string>>();
    const socketsBySubscription = new Map<string, Set<WebSocket>>();

    const subscribe = (socket: WebSocket, keys: string[]) => {
        const socketSubscriptions = subscriptionsBySocket.get(socket) ?? new Set<string>();
        subscriptionsBySocket.set(socket, socketSubscriptions);

        for (const key of keys) {
            socketSubscriptions.add(key);

            const sockets = socketsBySubscription.get(key) ?? new Set<WebSocket>();
            sockets.add(socket);
            socketsBySubscription.set(key, sockets);
        }
    };

    const unsubscribe = (socket: WebSocket, keys?: string[]) => {
        const socketSubscriptions = subscriptionsBySocket.get(socket);

        if (!socketSubscriptions) {
            return;
        }

        const keysToRemove = keys ?? Array.from(socketSubscriptions);

        for (const key of keysToRemove) {
            socketSubscriptions.delete(key);

            const sockets = socketsBySubscription.get(key);
            sockets?.delete(socket);

            if (sockets?.size === 0) {
                socketsBySubscription.delete(key);
            }
        }

        if (socketSubscriptions.size === 0) {
            subscriptionsBySocket.delete(socket);
        }
    };

    const sendJson = (socket: WebSocket, value: unknown) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(value));
        }
    };

    const handleClientMessage = (socket: WebSocket, rawMessage: WebSocket.RawData) => {
        const message = parseClientMessage(rawMessage.toString());

        if (!message) {
            sendJson(socket, {
                type: "error",
                eventTs: Date.now(),
                message: "Invalid websocket message",
            });
            return;
        }

        if (message.type === "ping") {
            sendJson(socket, { type: "pong", eventTs: Date.now() });
            return;
        }

        const keys = resolveSubscriptionKeys(message);

        if (keys.length === 0) {
            sendJson(socket, {
                type: "error",
                eventTs: Date.now(),
                message: "No valid market streams provided",
            });
            return;
        }

        if (message.type === "subscribe") {
            subscribe(socket, keys);
            sendJson(socket, { type: "subscribed", eventTs: Date.now(), streams: keys });
            return;
        }

        unsubscribe(socket, keys);
        sendJson(socket, { type: "unsubscribed", eventTs: Date.now(), streams: keys });
    };

    wss.on("connection", (socket) => {
        subscriptionsBySocket.set(socket, new Set());
        sendJson(socket, {
            type: "connection.ready",
            eventTs: Date.now(),
            protocol: "market-data.v1",
        });

        socket.on("message", (rawMessage) => handleClientMessage(socket, rawMessage));
        socket.on("close", () => unsubscribe(socket));
        socket.on("error", () => unsubscribe(socket));
    });

    return {
        wss,
        publishToLocalClients(event) {
            const key = streamKey(event.stream, event.marketId);
            const sockets = socketsBySubscription.get(key);

            if (!sockets) {
                return 0;
            }

            let sent = 0;

            for (const socket of Array.from(sockets)) {
                if (socket.readyState !== WebSocket.OPEN) {
                    unsubscribe(socket);
                    continue;
                }

                sendJson(socket, event);
                sent += 1;
            }

            return sent;
        },
        close: () =>
            new Promise((resolve, reject) => {
                wss.close((error) => (error ? reject(error) : resolve()));
            }),
        getSubscriptionCount: (key) => socketsBySubscription.get(key)?.size ?? 0,
    };
};

const parseClientMessage = (value: string): ClientMessage | null => {
    try {
        const parsed = JSON.parse(value) as Partial<ClientMessage>;

        if (
            parsed?.type === "subscribe" ||
            parsed?.type === "unsubscribe" ||
            parsed?.type === "ping"
        ) {
            return parsed as ClientMessage;
        }

        return null;
    } catch {
        return null;
    }
};

const resolveSubscriptionKeys = (
    message: SubscribeMessage | UnsubscribeMessage
) => {
    const explicitStreams = message.streams
        ?.map(parseStreamKey)
        .filter((key): key is { stream: MarketStream; marketId: string } => Boolean(key))
        .map(({ stream, marketId }) => streamKey(stream, marketId));

    if (explicitStreams?.length) {
        return Array.from(new Set(explicitStreams));
    }

    if (!message.marketId || !message.stream) {
        return [];
    }

    const streams = Array.isArray(message.stream) ? message.stream : [message.stream];

    return Array.from(
        new Set(
            streams
                .filter(isMarketStream)
                .map((stream) => streamKey(stream, message.marketId as string))
        )
    );
};
