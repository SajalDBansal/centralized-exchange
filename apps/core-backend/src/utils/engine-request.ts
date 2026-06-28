import {
    EngineRequestPayloadBySubject,
    EngineResponsePayloadBySubject,
    EngineStreamRequest,
    EventSource,
    IncomingEventTypes,
} from "@workspace/types";
import { backendRouter } from "./backendResponseRouter";

type RequestArguments<TSubject extends IncomingEventTypes> =
    EngineRequestPayloadBySubject[TSubject] extends undefined
        ? []
        : [payload: EngineRequestPayloadBySubject[TSubject]];

/**
 * Sends a typed command through market:event and waits for its correlated
 * engine:result response. This is the backend's active engine transport.
 */
export async function requestEngine<TSubject extends IncomingEventTypes>(
    type: TSubject,
    ...args: RequestArguments<TSubject>
): Promise<EngineResponsePayloadBySubject[TSubject]> {
    const payload = args[0];
    const request = {
        source: EventSource.BACKEND,
        type,
        ...(payload === undefined ? {} : { payload }),
    } as EngineStreamRequest<TSubject>;
    const result = await backendRouter.request(request);

    return result.payload;
}
