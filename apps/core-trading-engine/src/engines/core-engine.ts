import { AddMarketAssetPayload, AddMarketPayload, AddUserPayload, Asset, BalancesType, BaseReturnPayload, BaseReturnPayloadWithUser, CancelOrderPayload, CancelOrderReturnPayload, CreateOrderPayload, CreateOrderReturnPayload, DeleteMarketPayload, DeleteMarketReturnPayload, EngineSnapshot, EVENT_TO_ENGINE_SUBJECT, FundingPayments, FundingSettlePayload, FundingSettleReturnPayload, GetAssetsReturnPayload, GetDepthPayload, GetDepthReturnPayload, GetMarketByIdPayload, GetMarketByIdReturnPayload, GetMarketsReturnPayload, GetOrderByIdPayload, GetOrderByIdReturnPayload, GetUserBalancesPayload, GetUserBalancesReturnPayload, GetUserOpenOrdersPayload, GetUserOpenOrdersReturnPayload, IncomingEventTypes, IndexPriceUpdatePayload, IndexPriceUpdateReturnPayload, InMarketFillType, InMarketOrderType, Market, MarketFunds, MarketId, MarketRiskStates, MarketsType, MarketType, OnRampPayload, OnRampReturnPayload, OrderId, OrderPosition, OrderSide, OrderStatus, OrderType, PayloadToBackendType, PayloadToEngineType, STPMode, TimeInForce, UpdateMarketPayload, UpdateMarketReturnPayload, UserPositionType } from "@workspace/types";
import { OMSEngine } from "./oms-engine";
import { BalanceEngine } from "./balance-engine";
import { RejectError } from "../utils/error";
import { MatchingEngine } from "./matching-engine";
import { Position } from "./position-engine";
import { formatBigInt, normalizeOrderReturn, quoteNotional } from "../utils/parse-incoming";
import { MarketEngine } from "./market-engine";
import { SingleMarketOrderBook } from "./single-orderbook";
import { SingleMarketPositions } from "./single-market-positions";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseManager } from "../utils/database-manager";

// Data Store for the engine.
export class EngineState {

    balances: BalancesType = new Map();

    orderbooks: Map<MarketId, SingleMarketOrderBook> = new Map();

    positions: Map<MarketId, SingleMarketPositions> = new Map();

    markets: MarketsType = new Map();

    orderMap: Map<OrderId, MarketId> = new Map();

    orders: Map<OrderId, InMarketOrderType> = new Map();

    assets: Map<string, Asset> = new Map();

    marketRisk: MarketRiskStates = new Map();

    insuranceFunds: MarketFunds = new Map();

    commissionFunds: MarketFunds = new Map();

    fundingPayments: FundingPayments = [];
}

export class Engine {
    eventSequenceId: number;

    private readonly state: EngineState;

    private readonly omsChecker: OMSEngine;

    private readonly balanceEngine: BalanceEngine;

    private readonly matchingEngine: MatchingEngine;

    private readonly positionEngine: Position;

    private readonly marketEngine: MarketEngine;

    private readonly databaseManager: DatabaseManager;

    private readonly snapshotPath: string;

    constructor(snapshotPath = process.env.ENGINE_SNAPSHOT_PATH || join(process.cwd(), "snapshots", "core-engine.snapshot.txt")) {

        this.eventSequenceId = 0;

        this.state = new EngineState();

        this.snapshotPath = snapshotPath;

        this.omsChecker = new OMSEngine(this.state);

        this.balanceEngine = new BalanceEngine(this.state);

        this.matchingEngine = new MatchingEngine(this.state, this.balanceEngine);

        this.positionEngine = new Position(this.state);

        this.marketEngine = new MarketEngine(this.state, this.balanceEngine, this.positionEngine);

        this.databaseManager = new DatabaseManager();

        if (!this.loadSnapshot()) {
            this.marketEngine.initializeMarkets();
        }
    }

    process = async (subject: IncomingEventTypes, data?: PayloadToEngineType): Promise<PayloadToBackendType> => {
        try {
            this.databaseManager.reset();

            let result: PayloadToBackendType;

            switch (subject) {

                case EVENT_TO_ENGINE_SUBJECT.HEALTH_CHECK:

                    return {
                        success: true,
                        eventId: this.getUpdatedEventId(),
                        timestamp: Date.now(),
                        message: "Engine healthy",
                    };

                case EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE:
                    result = this.createOrder(data as CreateOrderPayload);
                    break;

                case EVENT_TO_ENGINE_SUBJECT.ORDER_CANCEL:
                    result = this.cancelOrder(data as CancelOrderPayload);
                    break;

                case EVENT_TO_ENGINE_SUBJECT.ORDER_OPEN_ORDERS:
                    return this.getOpenOrders(data as GetUserOpenOrdersPayload);

                case EVENT_TO_ENGINE_SUBJECT.ORDER_GET:
                    return this.getOrder(data as GetOrderByIdPayload);

                case EVENT_TO_ENGINE_SUBJECT.BALANCE_GET:
                    return this.getBalance(data as GetUserBalancesPayload);

                case EVENT_TO_ENGINE_SUBJECT.ON_RAMP:
                    result = this.onRamp(data as OnRampPayload);
                    break;

                case EVENT_TO_ENGINE_SUBJECT.DEPTH_GET:
                    return this.getMarketDepth(data as GetDepthPayload);

                case EVENT_TO_ENGINE_SUBJECT.USER_ADD:
                    result = this.userAdd(data as AddUserPayload);
                    break;

                case EVENT_TO_ENGINE_SUBJECT.MARKET_GET_ALL:
                    return this.getAllMarkets();

                case EVENT_TO_ENGINE_SUBJECT.MARKET_GET_ALL_ASSET:
                    return this.getAllAssets();

                case EVENT_TO_ENGINE_SUBJECT.MARKET_GET:
                    return this.getMarketById(data as GetMarketByIdPayload);

                case EVENT_TO_ENGINE_SUBJECT.MARKET_ADD:
                    result = this.addMarket(data as AddMarketPayload);
                    break;

                case EVENT_TO_ENGINE_SUBJECT.MARKET_UPDATE:
                    result = this.updateMarket(data as UpdateMarketPayload);
                    break;

                case EVENT_TO_ENGINE_SUBJECT.MARKET_DELETE:
                    result = this.deleteMarket(data as DeleteMarketPayload);
                    break;

                case EVENT_TO_ENGINE_SUBJECT.MARKET_ADD_ASSET:
                    result = this.addMarketAsset(data as AddMarketAssetPayload);
                    break;

                case EVENT_TO_ENGINE_SUBJECT.INDEX_PRICE_UPDATE:
                    result = this.processIndexPriceUpdate(data as IndexPriceUpdatePayload);
                    break;

                case EVENT_TO_ENGINE_SUBJECT.FUNDING_SETTLE:
                    result = this.processFundingSettle(data as FundingSettlePayload);
                    break;

                default:
                    return this.internalError("Invalid subject");
            }

            if (result.success) {
                this.saveSnapshot();
                await this.databaseManager.publish(subject, result.eventId, result.timestamp)
                    .catch((error) => console.error("Failed to publish database events", error));
            }

            return result;

        } catch (error) {

            console.error(error);

            return this.internalError(
                "Internal engine error"
            );
        }
    }

    private createOrder = (payload: CreateOrderPayload): CreateOrderReturnPayload => {
        let locked = false;
        let lockedAmount = 0n;
        let parsedOrder: ReturnType<OMSEngine["createOrderChecks"]> | undefined;

        try {

            parsedOrder = this.omsChecker.createOrderChecks(payload);

            lockedAmount = this.balanceEngine.lockBalance(parsedOrder);
            locked = true;

            if (parsedOrder.marketType === MarketType.PERP) {
                parsedOrder.margin = lockedAmount;
            }

            const { order: result, cancelledOrders, matchedOrders } = this.matchingEngine.createOrder(
                parsedOrder,
                lockedAmount
            );

            for (const cancelledOrder of cancelledOrders) {
                this.balanceEngine.releaseOrderMargin(cancelledOrder);
            }

            for (const fill of result.fills) {
                const makerOrder = matchedOrders.get(fill.makerOrderId);
                const takerOrder = matchedOrders.get(fill.takerOrderId);

                if (!makerOrder || !takerOrder) {
                    throw new Error("Matched order context missing");
                }

                if (payload.marketType === MarketType.PERP) {
                    this.positionEngine.applyFill(fill, makerOrder, takerOrder);
                    this.balanceEngine.applyPerpFillFees(fill, makerOrder, takerOrder);
                } else {
                    this.balanceEngine.applyFill(fill, makerOrder, takerOrder);
                }
            }

            this.balanceEngine.releaseUnusedBalance(result);

            const market = this.state.markets.get(result.marketId);
            const touchedOrders = new Map<OrderId, InMarketOrderType>();
            touchedOrders.set(result.orderId, result);
            for (const [orderId, order] of matchedOrders) {
                touchedOrders.set(orderId, order);
            }
            for (const cancelledOrder of cancelledOrders) {
                touchedOrders.set(cancelledOrder.orderId, cancelledOrder);
            }
            this.databaseManager.captureOrders(touchedOrders.values(), market);

            return {
                success: true,
                message: "Order created successfully",
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                data: {
                    order: normalizeOrderReturn(result, this.state.markets.get(result.marketId)),
                },
            };

        } catch (error) {

            if (locked) {
                if (parsedOrder) {
                    this.balanceEngine.releaseBalance(parsedOrder, lockedAmount);
                }
            }

            if (error instanceof RejectError) {

                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);

            return this.internalError("Create order failed") as CreateOrderReturnPayload;
        }
    }

    private cancelOrder = (payload: CancelOrderPayload): CancelOrderReturnPayload => {

        try {

            this.omsChecker.cancelOrderChecks(payload);

            const order = this.matchingEngine.cancelOrder(payload);

            this.balanceEngine.releaseOrderMargin(order);

            this.databaseManager.captureOrder(order, this.state.markets.get(order.marketId));

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Order canceled successfully",
                data: { order: normalizeOrderReturn(order, this.state.markets.get(order.marketId)) },
            };

        } catch (error) {

            if (error instanceof RejectError) {

                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);

            return this.internalError("Cancel order failed") as CancelOrderReturnPayload;
        }
    }

    private getBalance = (payload: GetUserBalancesPayload): GetUserBalancesReturnPayload => {

        try {

            const balances = this.balanceEngine.getUserBalances(payload);

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Balances fetched",
                data: { balances },
            };

        } catch (error) {

            if (error instanceof RejectError) {

                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);

            return this.internalError("Get balance failed") as GetUserBalancesReturnPayload;
        }
    }

    private onRamp = (payload: OnRampPayload): OnRampReturnPayload => {

        try {

            const parsed = this.omsChecker.UserBalanceCheck(payload);

            const balances = this.balanceEngine.addBalance(parsed);

            const result: OnRampReturnPayload = {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Balance added successfully",
                data: { ...balances },
            };

            this.databaseManager.captureOnRamp(payload, result);

            return result;

        } catch (error) {

            if (error instanceof RejectError) {
                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);

            return this.internalError("Onramp failed") as OnRampReturnPayload;
        }
    }

    private getOrder = (payload: GetOrderByIdPayload): GetOrderByIdReturnPayload => {

        try {
            this.omsChecker.getOrderByIdCheck(payload);

            const order = this.matchingEngine.getUserOrderByID(payload);

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Order fetched",
                data: { order: normalizeOrderReturn(order, this.state.markets.get(order.marketId)) },
            };

        } catch (error) {

            if (error instanceof RejectError) {

                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);

            return this.internalError("Get order failed") as GetOrderByIdReturnPayload;
        }
    }

    private getOpenOrders = (payload: GetUserOpenOrdersPayload): GetUserOpenOrdersReturnPayload => {

        try {
            this.omsChecker.getOpenOrderChecks(payload);

            const orders = this.matchingEngine.getUserOpenOrders(payload);

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Open orders fetched",
                data: { orders: orders.map((order) => normalizeOrderReturn(order, this.state.markets.get(order.marketId))) },
            };

        } catch (error) {

            if (error instanceof RejectError) {

                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);

            return this.internalError("Get open orders failed") as GetUserOpenOrdersReturnPayload;
        }
    }

    private getMarketDepth = (payload: GetDepthPayload): GetDepthReturnPayload => {

        try {
            this.omsChecker.getDepthMarketCheck(payload);

            const data = this.matchingEngine.getMarketDepth(payload);

            return {
                success: true,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Depth fetched",
                data: { ...data },
            };

        } catch (error) {

            if (error instanceof RejectError) {

                return {
                    success: false,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);

            return this.internalError("Depth fetch failed") as GetDepthReturnPayload;
        }
    }

    private internalError(message: string): BaseReturnPayload {

        return {
            success: false,
            eventId: this.getUpdatedEventId(),
            timestamp: Date.now(),
            message,
        };
    }

    getUpdatedEventId(): number {

        return (++this.eventSequenceId);
    }

    private getMarketById = (payload: GetMarketByIdPayload): GetMarketByIdReturnPayload => {
        try {
            const market = this.omsChecker.getMarketByIdCheck(payload);

            return {
                success: true,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Market fetched",
                data: { market },
            };
        } catch (error) {

            if (error instanceof RejectError) {
                return {
                    success: false,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);
            return this.internalError("Get market failed") as GetMarketByIdReturnPayload;
        }
    };

    private addMarket = (payload: AddMarketPayload): BaseReturnPayloadWithUser => {
        try {
            this.omsChecker.addMarketCheck(payload);
            this.marketEngine.addMarket(payload.market);
            const market = this.state.markets.get(payload.market.id);

            if (market) {
                this.databaseManager.captureMarket(market);
            }

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Market added successfully",
            };
        } catch (error) {

            if (error instanceof RejectError) {
                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);
            return this.internalError("Add market failed") as BaseReturnPayloadWithUser;
        }
    };

    private getAllMarkets = (): GetMarketsReturnPayload => {
        try {
            const markets = this.marketEngine.getMarkets();
            return {
                success: true,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Markets fetched",
                data: { markets },
            };
        } catch (error) {

            if (error instanceof RejectError) {
                return {
                    success: false,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);
            return this.internalError("Get markets failed") as GetMarketsReturnPayload;
        }
    };

    private getAllAssets = (): GetAssetsReturnPayload => {
        try {
            const assets = this.marketEngine.getAssets();
            return {
                success: true,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Markets fetched",
                data: { assets },
            };
        } catch (error) {

            if (error instanceof RejectError) {
                return {
                    success: false,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);
            return this.internalError("Get markets failed") as GetAssetsReturnPayload;
        }
    };

    private userAdd = (payload: AddUserPayload): BaseReturnPayload => {

        try {
            this.omsChecker.addUserCheck(payload.userId);

            const result = this.balanceEngine.addUser(payload.userId);

            return {
                success: result.success,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: result.message,
            };
        } catch (error) {

            if (error instanceof RejectError) {

                return {
                    success: false,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);
            return this.internalError("Failed to add user") as BaseReturnPayload;
        }
    };

    private addMarketAsset = (payload: AddMarketAssetPayload): BaseReturnPayloadWithUser => {

        try {
            this.omsChecker.addMarketAssetCheck(payload);
            this.marketEngine.addMarketAsset(payload.asset, payload.assetSide);
            this.databaseManager.captureAsset(payload.asset);

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Market asset added successfully",
            };
        } catch (error) {

            if (error instanceof RejectError) {
                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);
            return this.internalError("Add market asset failed") as BaseReturnPayloadWithUser;
        }
    };

    private updateMarket = (payload: UpdateMarketPayload): UpdateMarketReturnPayload => {
        try {
            this.omsChecker.updateMarketCheck(payload);
            const market = this.marketEngine.updateMarket(payload.marketId, payload.market);
            this.databaseManager.captureMarket(market);

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Market updated successfully",
                data: { market },
            };
        } catch (error) {
            if (error instanceof RejectError) {
                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);
            return this.internalError("Update market failed") as UpdateMarketReturnPayload;
        }
    };

    private deleteMarket = (payload: DeleteMarketPayload): DeleteMarketReturnPayload => {
        try {
            this.omsChecker.deleteMarketCheck(payload);
            const market = this.state.markets.get(payload.marketId);
            this.marketEngine.deleteMarket(payload.marketId);

            if (market) {
                this.databaseManager.captureDeletedMarket(market);
            }

            return {
                success: true,
                userId: payload.userId,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Market deleted successfully",
                data: { marketId: payload.marketId },
            };
        } catch (error) {
            if (error instanceof RejectError) {
                return {
                    success: false,
                    userId: payload.userId,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);
            return this.internalError("Delete market failed") as DeleteMarketReturnPayload;
        }
    };

    private processIndexPriceUpdate = (payload: IndexPriceUpdatePayload): IndexPriceUpdateReturnPayload => {
        try {
            const update = this.marketEngine.onIndexPriceUpdate(payload);
            const liquidation = this.executeLiquidations(update.liquidatablePositions, update.indexPrice, payload.timestamp);

            return {
                success: true,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Index price updated",
                data: {
                    marketId: payload.marketId,
                    indexPrice: update.indexPrice,
                    liquidatablePositionIds: liquidation.positionIds,
                    liquidationAttempts: liquidation.attempts,
                    liquidationFailures: liquidation.failures,
                },
            };
        } catch (error) {
            if (error instanceof RejectError) {
                return {
                    success: false,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);
            return this.internalError("Index price update failed") as IndexPriceUpdateReturnPayload;
        }
    };

    private processFundingSettle = (payload: FundingSettlePayload): FundingSettleReturnPayload => {
        try {
            const market = this.state.markets.get(payload.marketId);
            const fundingPaymentStart = this.state.fundingPayments.length;
            const update = this.marketEngine.onFundingSettle(payload);
            const fundingPayments = this.state.fundingPayments.slice(fundingPaymentStart);
            const liquidation = this.executeLiquidations(
                update.liquidatablePositions,
                formatBigInt(update.indexPrice, market?.quoteAsset.precision ?? 0),
                Date.now()
            );

            const result: FundingSettleReturnPayload = {
                success: true,
                eventId: this.getUpdatedEventId(),
                timestamp: Date.now(),
                message: "Funding settled",
                data: {
                    marketId: payload.marketId,
                    fundingRateBps: update.fundingRateBps.toString(),
                    payments: update.payments,
                    insuranceUsed: formatBigInt(update.insuranceUsed, market?.quoteAsset.precision ?? 0),
                    liquidatablePositionIds: liquidation.positionIds,
                },
            };

            this.databaseManager.captureFundingSettlement(payload, result, fundingPayments, market);

            return result;
        } catch (error) {
            if (error instanceof RejectError) {
                return {
                    success: false,
                    eventId: this.getUpdatedEventId(),
                    timestamp: Date.now(),
                    message: error.message,
                    code: error.code,
                };
            }

            console.error(error);
            return this.internalError("Funding settlement failed") as FundingSettleReturnPayload;
        }
    };

    private executeLiquidations(positions: UserPositionType[], entryPrice: string, timestamp: number) {
        const positionIds = positions.map((position) => position.positionId);
        let attempts = 0;
        let failures = 0;

        for (const position of positions) {
            attempts++;
            const side = position.position === OrderPosition.LONG ? OrderSide.SELL : OrderSide.BUY;
            const opposingPosition = position.position === OrderPosition.LONG ? OrderPosition.SHORT : OrderPosition.LONG;
            const market = this.state.markets.get(position.market);

            if (!market) {
                failures++;
                continue;
            }

            const result = this.createOrder({
                userId: position.userId,
                marketId: position.market,
                marketType: MarketType.PERP,
                side,
                position: opposingPosition,
                type: OrderType.MARKET,
                entryPrice,
                quantity: formatBigInt(position.quantity, market.baseAsset.precision),
                leverage: Math.max(1, Math.ceil(position.leverage)),
                reduceOnly: true,
                liquidation: true,
                postOnly: false,
                stpMode: STPMode.CANCEL_TAKER,
                timeInForce: TimeInForce.IOC,
                createdAt: timestamp,
            });

            if (!result.success) {
                failures++;
                continue;
            }

            if (result.data?.order) {
                this.databaseManager.captureLiquidation(position, result.data.order, entryPrice, market, timestamp);
            }
        }

        return { positionIds, attempts, failures };
    }

    private saveSnapshot() {
        const snapshot: EngineSnapshot = {
            eventSequenceId: this.eventSequenceId,
            balances: Array.from(this.state.balances.entries()).map(([userId, balances]) => [
                userId,
                Array.from(balances.entries()).map(([asset, balance]) => [
                    asset,
                    { total: balance.total.toString(), locked: balance.locked.toString() },
                ]),
            ]),
            markets: Array.from(this.state.markets.entries()),
            positions: Array.from(this.state.positions.entries()).map(([marketId, positions]) => [
                marketId,
                Array.from(positions.entries()).map(([userId, position]) => [
                    userId,
                    this.stringifyBigInts({ ...position }),
                ]),
            ]),
            orders: Array.from(this.state.orders.entries()).map(([orderId, order]) => [
                orderId,
                this.stringifyBigInts({ ...order, fills: order.fills.map((fill) => this.stringifyBigInts({ ...fill })) }),
            ]),
            assets: Array.from(this.state.assets.entries()),
            marketRisk: Array.from(this.state.marketRisk.entries()).map(([marketId, risk]) => [
                marketId,
                {
                    indexPrice: risk.indexPrice.toString(),
                    indexUpdatedAt: risk.indexUpdatedAt,
                    lastFundingRateBps: risk.lastFundingRateBps.toString(),
                    lastFundingSettledAt: risk.lastFundingSettledAt,
                },
            ]),
            insuranceFunds: Array.from(this.state.insuranceFunds.entries()).map(([marketId, amount]) => [marketId, amount.toString()]),
            commissionFunds: Array.from(this.state.commissionFunds.entries()).map(([marketId, amount]) => [marketId, amount.toString()]),
            fundingPayments: this.state.fundingPayments.map((payment) => this.stringifyBigInts({ ...payment })),
        };

        mkdirSync(dirname(this.snapshotPath), { recursive: true });
        writeFileSync(this.snapshotPath, JSON.stringify(snapshot, null, 2));
    }

    private loadSnapshot() {
        if (!existsSync(this.snapshotPath)) {
            return false;
        }

        const snapshot = JSON.parse(readFileSync(this.snapshotPath, "utf8")) as EngineSnapshot;

        this.eventSequenceId = snapshot.eventSequenceId || 0;
        this.state.markets = new Map(snapshot.markets);
        this.state.assets = new Map(snapshot.assets);
        this.state.marketRisk = new Map((snapshot.marketRisk ?? []).map(([marketId, risk]) => [
            marketId,
            {
                indexPrice: BigInt(risk.indexPrice),
                indexUpdatedAt: risk.indexUpdatedAt,
                lastFundingRateBps: BigInt(risk.lastFundingRateBps),
                lastFundingSettledAt: risk.lastFundingSettledAt,
            },
        ]));
        this.state.insuranceFunds = new Map((snapshot.insuranceFunds ?? []).map(([marketId, amount]) => [marketId, BigInt(amount)]));
        this.state.commissionFunds = new Map((snapshot.commissionFunds ?? []).map(([marketId, amount]) => [marketId, BigInt(amount)]));
        this.state.fundingPayments = (snapshot.fundingPayments ?? []).map((payment) => ({
            ...payment,
            amount: this.requiredBigInt(payment.amount),
            fundingRateBps: this.requiredBigInt(payment.fundingRateBps),
        })) as FundingPayments;
        this.state.balances = new Map(snapshot.balances.map(([userId, balances]) => [
            userId,
            new Map(balances.map(([asset, balance]) => [
                asset,
                { total: BigInt(balance.total), locked: BigInt(balance.locked) },
            ])),
        ]));
        const snapshotPositions = snapshot.positions.flatMap(([, positions]) =>
            positions.map(([, position]) => this.parsePosition(position))
        );
        this.state.positions = new Map();
        this.state.orders = new Map(snapshot.orders
            .map(([orderId, order]) => [orderId, this.parseOrder(order)] as const)
            .filter(([, order]) => this.isLiveOrder(order)));
        this.state.orderbooks = new Map();
        this.state.orderMap = new Map();

        for (const market of this.state.markets.values()) {
            this.state.orderbooks.set(market.id, new SingleMarketOrderBook(market, this.state.orderMap, this.state.orders, this.balanceEngine));
            this.positionEngine.initializeMarket(market);
        }

        for (const position of snapshotPositions) {
            this.positionEngine.restorePosition(position);
        }

        const openOrders = Array.from(this.state.orders.values())
            .filter((order) => (order.status === OrderStatus.OPEN || order.status === OrderStatus.PARTIAL_FILLED) && order.remainingQty > 0n)
            .sort((a, b) => a.createdAt - b.createdAt);

        for (const order of openOrders) {
            const orderbook = this.state.orderbooks.get(order.marketId);
            orderbook?.restoreOrder(order);
        }

        return true;
    }

    private stringifyBigInts<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [
                key,
                this.stringifySnapshotValue(entry),
            ])
        );
    }

    private isLiveOrder(order: InMarketOrderType) {
        return (order.status === OrderStatus.OPEN || order.status === OrderStatus.PARTIAL_FILLED)
            && order.remainingQty > 0n;
    }

    private stringifySnapshotValue(value: unknown): unknown {
        if (typeof value === "bigint") {
            return value.toString();
        }

        if (Array.isArray(value)) {
            return value.map((entry) => this.stringifySnapshotValue(entry));
        }

        if (value && typeof value === "object") {
            return Object.fromEntries(
                Object.entries(value).map(([key, entry]) => [key, this.stringifySnapshotValue(entry)])
            );
        }

        return value;
    }

    private parseOrder(order: Record<string, unknown>): InMarketOrderType {
        const fills = Array.isArray(order.fills) ? order.fills.map((fill) => this.parseFill(fill as Record<string, unknown>)) : [];
        const margin = typeof order.margin === "string" ? BigInt(order.margin) : undefined;
        const entryPrice = BigInt(order.entryPrice as string);
        const quantity = BigInt(order.quantity as string);
        const remainingQty = BigInt(order.remainingQty as string);
        const status = order.status === "PARTIAL" ? OrderStatus.PARTIAL_FILLED : order.status;
        const marginLedger = order.marginLedger && typeof order.marginLedger === "object"
            ? order.marginLedger as Record<string, unknown>
            : undefined;
        const balanceLedger = order.balanceLedger && typeof order.balanceLedger === "object"
            ? order.balanceLedger as Record<string, unknown>
            : undefined;
        const market = this.state.markets.get(order.marketId as MarketId);
        const restoreSpotReservation = status === OrderStatus.OPEN || status === OrderStatus.PARTIAL_FILLED;
        const fallbackSpotReservation = restoreSpotReservation && remainingQty > 0n
            ? order.side === OrderSide.BUY && market
                ? quoteNotional(remainingQty, entryPrice, market)
                : remainingQty
            : 0n;

        return {
            ...order,
            status,
            entryPrice,
            quantity,
            margin,
            ...(order.marketType === MarketType.PERP
                ? {
                    marginLedger: {
                        allotted: this.requiredBigInt(marginLedger?.allotted ?? margin ?? 0n),
                        used: this.requiredBigInt(marginLedger?.used ?? 0n),
                        released: this.requiredBigInt(marginLedger?.released ?? 0n),
                    },
                }
                : {
                    balanceLedger: {
                        allotted: this.requiredBigInt(balanceLedger?.allotted ?? fallbackSpotReservation),
                        used: this.requiredBigInt(balanceLedger?.used ?? 0n),
                        released: this.requiredBigInt(balanceLedger?.released ?? 0n),
                    },
                }),
            filled: BigInt(order.filled as string),
            remainingQty,
            averagePrice: BigInt(order.averagePrice as string),
            fills,
        } as InMarketOrderType;
    }

    private parseFill(fill: Record<string, unknown>): InMarketFillType {
        return {
            ...fill,
            price: BigInt(fill.price as string),
            qty: BigInt(fill.qty as string),
            tradeId: BigInt(fill.tradeId as string),
        } as InMarketFillType;
    }

    private parsePosition(position: Record<string, unknown>): UserPositionType {
        return {
            ...position,
            margin: this.requiredBigInt(position.margin),
            averagePrice: this.requiredBigInt(position.averagePrice),
            quantity: this.requiredBigInt(position.quantity),
            liquidationPrice: this.requiredBigInt(position.liquidationPrice),
            bankruptcyPrice: this.requiredBigInt(position.bankruptcyPrice ?? 0n),
            entryPrice: this.requiredBigInt(position.entryPrice),
            upnl: this.requiredBigInt(position.upnl),
        } as UserPositionType;
    }

    private requiredBigInt(value: unknown) {
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint" && typeof value !== "boolean") {
            throw new Error("Invalid bigint value in engine snapshot");
        }

        return BigInt(value);
    }
}

