import { errorMiddleware } from "./middleware/global-handler";
import appRouter from "./routers";
import { createServer } from "./server";

const port = process.env.PORT || 3001;
const server = createServer();

server.use("/api/v1", appRouter);

appRouter.use(errorMiddleware);

server.listen(port, () => {
  console.log(`Core Backend Server Running on ${port}`);
});
