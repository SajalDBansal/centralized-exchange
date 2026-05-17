import { Engine } from "./engines/core-engine";
import { NatsManager } from "@workspace/nats-streams";

async function main() {
    const engine = new Engine();
    const nats = (await NatsManager.getInstance());

    await nats.subscribe("engine.>", engine.process);

    console.log("Engine Started");
}

main();
