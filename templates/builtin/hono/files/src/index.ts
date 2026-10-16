import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.text("Hello from {{name}}"));
app.get("/api/hello", (c) => c.json({ message: "Hello from {{name}}" }));

// Runyard passes the port in the PORT environment variable.
// Listen on 127.0.0.1 only, so the service is not reachable from other machines.
const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`Listening on http://${info.address}:${info.port}`);
});
