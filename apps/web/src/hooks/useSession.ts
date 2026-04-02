import { createSignal } from "solid-js";
import type { Phase, Analysis, Message } from "../types";

export function useSession() {
  const [phase, setPhase] = createSignal<Phase>("input");
  const [url, setUrl] = createSignal("");
  const [analysis, setAnalysis] = createSignal<Analysis | null>(null);
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [error, setError] = createSignal<string | null>(null);
  const [streaming, setStreaming] = createSignal(false);

  function reset() {
    setPhase("input");
    setUrl("");
    setAnalysis(null);
    setMessages([]);
    setError(null);
    setStreaming(false);
  }

  async function startSession(inputUrl: string) {
    setUrl(inputUrl);
    setPhase("fetching");
    setError(null);

    try {
      const fetchRes = await fetch("/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inputUrl }),
      });

      if (!fetchRes.ok) {
        const err = await fetchRes.json();
        throw new Error(err.error || "Failed to fetch article");
      }

      const { text } = await fetchRes.json();

      setPhase("analyzing");

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!analyzeRes.ok) {
        const err = await analyzeRes.json();
        throw new Error(err.error || "Failed to analyze article");
      }

      const result: Analysis = await analyzeRes.json();

      setAnalysis(result);
      setMessages([{ role: "assistant", content: result.first_question }]);
      setPhase("session");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setPhase("error");
    }
  }

  async function sendMessage(content: string) {
    const currentAnalysis = analysis();
    if (!currentAnalysis || streaming()) return;

    const userMessage: Message = { role: "user", content };
    const newHistory = [...messages(), userMessage];

    setMessages([...newHistory, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis: currentAnalysis,
          history: newHistory,
        }),
      });

      if (!res.ok) throw new Error("Chat request failed");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;

          try {
            const { delta } = JSON.parse(data);
            assistantContent += delta;
            setMessages((prev) => {
              const msgs = [...prev];
              msgs[msgs.length - 1] = {
                role: "assistant",
                content: assistantContent,
              };
              return msgs;
            });
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setStreaming(false);
    }
  }

  return {
    phase,
    url,
    analysis,
    messages,
    error,
    streaming,
    setUrl,
    startSession,
    sendMessage,
    reset,
  };
}
