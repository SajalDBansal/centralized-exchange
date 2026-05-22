import "./utils/config";
import { errorMiddleware } from "./middleware/error-handler";
import appRouter from "./routers/index";
import { createServer } from "./server";
import config from "./utils/config";
import { backendRouter } from "./utils/backendResponseRouter";

const server = createServer();

server.use("/api/v1", appRouter);

appRouter.use(errorMiddleware);

backendRouter.startListener()
  .then(() => {
    console.log("Backend response listener started");
  })
  .catch((err) => {
    console.error("Failed to start backend response listener:", err);
  });

server.listen(config.PORT, () => {
  console.log(`Core Backend Server Running on ${config.PORT}`);
});
