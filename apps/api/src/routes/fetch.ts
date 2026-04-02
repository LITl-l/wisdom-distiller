import { Hono } from "hono";
import { parseHTML } from "linkedom";
import type { FetchRequest, FetchResponse } from "../types";

const app = new Hono();

const REMOVE_SELECTORS = [
  "script",
  "style",
  "nav",
  "header",
  "footer",
  "aside",
  "noscript",
  "iframe",
  "svg",
];

const MAX_TEXT_LENGTH = 8000;

function htmlToText(html: string): { text: string; title: string } {
  const { document } = parseHTML(html);

  for (const selector of REMOVE_SELECTORS) {
    for (const el of document.querySelectorAll(selector)) {
      el.remove();
    }
  }

  const title =
    document.querySelector("h1")?.textContent?.trim() ||
    document.querySelector("title")?.textContent?.trim() ||
    "";

  const raw = (
    document.querySelector("article") ||
    document.querySelector("main") ||
    document.body
  ).textContent || "";

  const text = raw
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);

  return { text, title };
}

app.post("/", async (c) => {
  const { url } = await c.req.json<FetchRequest>();

  if (!url) {
    return c.json({ error: "url is required" }, 400);
  }

  try {
    new URL(url);
  } catch {
    return c.json({ error: "Invalid URL" }, 400);
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; WisdomDistiller/1.0; +https://github.com/LITl-l/wisdom-distiller)",
    },
  });

  if (!res.ok) {
    return c.json({ error: `Failed to fetch: ${res.status}` }, 502);
  }

  const html = await res.text();
  const { text, title } = htmlToText(html);

  return c.json({ text, title } satisfies FetchResponse);
});

export default app;
