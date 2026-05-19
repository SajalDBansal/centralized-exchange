import { FillType, InMarketOrderType } from "@workspace/types";
import { EngineState } from "./core-engine";

export class Position {

    constructor(private readonly state: EngineState) { }


    addPosition(order: InMarketOrderType) {

    }

    applyFill(fill: FillType) {

    }

}