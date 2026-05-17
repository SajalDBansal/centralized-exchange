import { BaseReturnPayload, BaseReturnPayloadWithUser, CancelOrderPayload, CreateOrderPayload, CreateOrderReturnPayload, GetDepthPayload, GetDepthReturnPayload, GetOrderByIdPayload, GetOrderByIdReturnPayload, GetUserBalancesPayload, GetUserBalancesReturnPayload, GetUserOpenOrdersPayload, GetUserOpenOrdersReturnPayload, NATS_INCOMING_SUBJECT, NatsIncomingSubjectTypes, OnRampPayload, PayloadToBackendType, PayloadToEngineType } from "@workspace/types";
import { OMSEngine } from "./oms-engine";

export class Engine {
    OMSChecker: OMSEngine = new OMSEngine();

    async process(subject: NatsIncomingSubjectTypes, data: PayloadToEngineType): Promise<PayloadToBackendType> {
        try {
            switch (subject) {
                case NATS_INCOMING_SUBJECT.HEALTH_CHECK:
                    const toSend: BaseReturnPayload = {
                        success: true,
                        message: "Hello from engine",
                    }
                    return toSend;

                case NATS_INCOMING_SUBJECT.ORDER_CREATE:
                    const createPayloadData = data as CreateOrderPayload;
                    return this.createOrder(createPayloadData);

                case NATS_INCOMING_SUBJECT.ORDER_CANCEL:
                    const cancelPayloadData = data as CancelOrderPayload;
                    return this.cancelOrder(cancelPayloadData);

                case NATS_INCOMING_SUBJECT.ORDER_GET:
                    const getOrderPayloadData = data as GetOrderByIdPayload;
                    return this.getOrder(getOrderPayloadData);

                case NATS_INCOMING_SUBJECT.ORDER_OPEN_ORDERS:
                    const openOrderPayloadData = data as GetUserOpenOrdersPayload;
                    return this.getOpenOrder(openOrderPayloadData);

                case NATS_INCOMING_SUBJECT.BALANCE_GET:
                    const getBalancePayloadData = data as GetUserBalancesPayload;
                    return this.getBalance(getBalancePayloadData);

                case NATS_INCOMING_SUBJECT.ON_RAMP:
                    const onRampPayloadData = data as OnRampPayload;
                    return this.onRamp(onRampPayloadData);

                case NATS_INCOMING_SUBJECT.DEPTH_GET:
                    const getDepthPayloadData = data as GetDepthPayload;
                    return this.getDepth(getDepthPayloadData);

                default:
                    const errorData: BaseReturnPayload = {
                        success: false,
                        message: "No such subject available on engine",
                    }
                    return errorData;
            }

        } catch (error: any) {
            const errorData: BaseReturnPayload = {
                success: false,
                message: error || "No such subject available on engine",
            }
            return errorData;
        }

    }

    private createOrder(payload: CreateOrderPayload): CreateOrderReturnPayload { }

    private cancelOrder(payload: CancelOrderPayload): CancelOrderReturnPayload { }

    private getOrder(payload: GetOrderByIdPayload): GetOrderByIdReturnPayload { }

    private getOpenOrder(payoad: GetUserOpenOrdersPayload): GetUserOpenOrdersReturnPayload { }

    private getBalance(payload: GetUserBalancesPayload): GetUserBalancesReturnPayload { }

    private onRamp(payload: OnRampPayload): BaseReturnPayloadWithUser { }

    private getDepth(payload: GetDepthPayload): GetDepthReturnPayload { }


    // Create order flow
    //  1. OMS Check
    //  2. Risk Check
    //  3. Margin Check
    //  4. lock balance
    //  5. Mathcing Order
    //  6. Release or set balance
    //  6. Send To Positon

    // Cancel Order
    //  1. OMS Check
    //  2. Risk Check
    //  3. Margin Check
    //  4. Cancel Order
    //  5. Unlock Balance

    // Get Order
    //  1. OMS Check
    //  2. Fetch And Send Order

    // Get Open Orders
    //  1. OMS Check
    //  2. Fetch And Send Orders

    // Get Balances
    //  1. OMS Check
    //  2. Fetch And Send Balances

    // Add Balance Check
    //  1. OMS Check
    //  2. Increase Balance

    // Get Depth 
    //  1. OMS Check
    //  2. Increase Balance

    //  sort the position liquidation price in a sorted way such that the coming index price calculates the top luqidable positions and as the top price lquidates moves to the lower level

}