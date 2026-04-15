import type { MiddlewareHandler } from "hono";

const VALID_API_KEY = process.env.API_KEY || "test-api-key";

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const apiKey = c.req.header("X-API-Key");

  if (!apiKey || apiKey !== VALID_API_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};
