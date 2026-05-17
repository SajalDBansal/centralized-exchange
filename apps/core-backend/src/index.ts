import "./utils/config";
import { errorMiddleware } from "./middleware/error-handler";
import appRouter from "./routers/index";
import { createServer } from "./server";
import config from "./utils/config";

const server = createServer();

server.use("/api/v1", appRouter);

appRouter.use(errorMiddleware);

server.listen(config.PORT, () => {
  console.log(`Core Backend Server Running on ${config.PORT}`);
});
