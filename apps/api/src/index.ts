import { Hono } from "hono";
import { cors } from "hono/cors";
import fetchRoute from "./routes/fetch";
import analyzeRoute from "./routes/analyze";
import chatRoute from "./routes/chat";

const app = new Hono();

app.use("/*", cors({ origin: "http://localhost:5173" }));

app.route("/api/fetch", fetchRoute);
app.route("/api/analyze", analyzeRoute);
app.route("/api/chat", chatRoute);

app.get("/", (c) => c.text("Wisdom Distiller API"));

export default {
  port: 3000,
  fetch: app.fetch,
};
