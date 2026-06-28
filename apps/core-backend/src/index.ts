import "./utils/config";
import { errorMiddleware } from "./middleware/error-handler";
import appRouter from "./routers/index";
import { createServer } from "./server";
import config from "./utils/config";
import { backendRouter } from "./utils/backendResponseRouter";

const server = createServer();

server.use("/api/v1", appRouter);

appRouter.use(errorMiddleware);

async function main() {
  // Do not accept HTTP requests until the Redis result listener is ready.
  await backendRouter.startListener();
  console.log("Backend Redis response listener started");

  server.listen(config.PORT, () => {
    console.log(`Core Backend Server Running on ${config.PORT}`);
  });
}

void main().catch((error) => {
  console.error("Failed to start core backend:", error);
  process.exitCode = 1;
});
