import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync, readFileSync } from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API key auth — only active when API_SECRET env var is set.
// The /healthz endpoint is always public so Render keep-alive works.
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const secret = process.env.API_SECRET;
  if (!secret || req.path === "/healthz") return next();
  const auth = (req.headers["authorization"] ?? req.headers["x-api-key"]) as string | undefined;
  const provided = auth?.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (provided !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

app.use("/api", router);

// Serve the built React frontend in production
// Path is relative to the monorepo root (process.cwd())
const frontendDist = path.resolve(process.cwd(), "artifacts/icondo-booker/dist/public");
if (existsSync(frontendDist)) {
  // Disable automatic index.html serving so we can inject the API secret
  app.use(express.static(frontendDist, { index: false }));
  // SPA fallback — inject API_SECRET into the page so the frontend can auth
  app.get("/{*path}", (_req, res) => {
    const html = readFileSync(path.join(frontendDist, "index.html"), "utf-8");
    const secret = process.env.API_SECRET ?? "";
    const injected = html.replace(
      "</head>",
      `<script>window.__API_SECRET__=${JSON.stringify(secret)}</script></head>`,
    );
    res.type("html").send(injected);
  });
  logger.info({ frontendDist }, "Serving built frontend");
}

export default app;
