const MAX_TEXT_LENGTH = 8000;
const READER_ENDPOINT = "https://r.jina.ai/";

export type FetchedArticle = {
  text: string;
  title: string;
};

/**
 * Fetch and extract an article via Jina Reader — a free CORS-enabled
 * service that converts any URL into LLM-friendly markdown.
 * Docs: https://jina.ai/reader/
 */
export async function fetchArticle(url: string): Promise<FetchedArticle> {
  try {
    new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  const res = await fetch(`${READER_ENDPOINT}${url}`, {
    headers: {
      Accept: "text/plain",
      "X-Return-Format": "markdown",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch article: ${res.status}`);
  }

  const raw = await res.text();

  // Jina Reader prefixes output with "Title: ...\n\nURL Source: ...\n\nMarkdown Content:\n".
  // Parse that envelope to recover the title, then strip to the body.
  const titleMatch = raw.match(/^Title:\s*(.+)$/m);
  const title = titleMatch?.[1]?.trim() ?? "";

  const bodyStart = raw.indexOf("Markdown Content:");
  const body = bodyStart >= 0 ? raw.slice(bodyStart + "Markdown Content:".length) : raw;

  const text = body
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);

  return { text, title };
}
