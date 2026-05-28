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
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Password login ───────────────────────────────────────────────────────────
// Set APP_PASSWORD in Render env vars to require a password to access the app.
// The /api/healthz endpoint is always public so Render keep-alive works.
const APP_PASSWORD = process.env.APP_PASSWORD;

function getAuthCookie(req: Request): string | undefined {
  return req.headers.cookie?.split(";").reduce((acc, c) => {
    const [k, ...v] = c.trim().split("=");
    acc[k.trim()] = decodeURIComponent(v.join("="));
    return acc;
  }, {} as Record<string, string>)["icondo_auth"];
}

const LOGIN_PAGE = (error = false) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>iCondo Booker</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;
         display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
    .card{background:#fff;border-radius:14px;border:1px solid #e5e7eb;padding:36px;
          width:100%;max-width:360px;box-shadow:0 1px 4px rgba(0,0,0,.07)}
    h1{font-size:18px;font-weight:600;color:#111827;margin-bottom:4px}
    p{font-size:13px;color:#6b7280;margin-bottom:24px}
    label{display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px}
    input[type=password]{width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;
                         font-size:14px;outline:none;transition:border .15s,box-shadow .15s}
    input[type=password]:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12)}
    button{width:100%;margin-top:14px;padding:10px;background:#6366f1;color:#fff;border:none;
           border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;transition:background .15s}
    button:hover{background:#4f46e5}
    .err{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:10px 12px;
         border-radius:8px;font-size:13px;margin-bottom:16px}
  </style>
</head>
<body>
  <div class="card">
    <h1>iCondo Booker</h1>
    <p>Enter your password to continue.</p>
    ${error ? '<div class="err">Wrong password — try again.</div>' : ""}
    <form method="POST" action="/login">
      <label for="pw">Password</label>
      <input type="password" id="pw" name="password" autofocus autocomplete="current-password" />
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`;

if (APP_PASSWORD) {
  // Login page
  app.get("/login", (_req: Request, res: Response) => {
    res.type("html").send(LOGIN_PAGE());
  });

  // Login submit
  app.post("/login", (req: Request, res: Response) => {
    if (req.body.password === APP_PASSWORD) {
      const maxAge = 60 * 60 * 24 * 30; // 30 days
      res.setHeader("Set-Cookie", `icondo_auth=${APP_PASSWORD}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`);
      res.redirect("/");
    } else {
      res.type("html").send(LOGIN_PAGE(true));
    }
  });

  // Gate everything except /login and /api/healthz
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/login") return next();
    if (req.path.startsWith("/api/healthz")) return next();
    if (getAuthCookie(req) === APP_PASSWORD) return next();
    // API calls get 401, page requests get redirect
    if (req.path.startsWith("/api/")) {
      res.status(401).json({ error: "Unauthorized" });
    } else {
      res.redirect("/login");
    }
  });
}

// ─── API key auth ─────────────────────────────────────────────────────────────
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const secret = process.env.API_SECRET;
  if (!secret || req.path === "/healthz") return next();
  const auth = (req.headers["authorization"] ?? req.headers["x-api-key"]) as string | undefined;
  const provided = auth?.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (provided !== secret) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
});

app.use("/api", router);

// ─── Frontend ─────────────────────────────────────────────────────────────────
const frontendDist = path.resolve(process.cwd(), "artifacts/icondo-booker/dist/public");
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { index: false }));
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
