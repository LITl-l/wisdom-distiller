import { createSignal } from "solid-js";
import type { Phase, Analysis, Message } from "../types";
import { createLLMClient, type ProviderConfig } from "../lib/llm";
import { fetchArticle } from "../lib/fetchArticle";
import { analyzeArticle } from "../lib/analyze";
import { streamChatReply } from "../lib/chat";

export function useSession(getConfig: () => ProviderConfig | null) {
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

  function requireClient() {
    const config = getConfig();
    if (!config) throw new Error("LLM プロバイダが未設定です。設定を開いてください。");
    return createLLMClient(config);
  }

  async function startSession(inputUrl: string) {
    setUrl(inputUrl);
    setPhase("fetching");
    setError(null);

    try {
      const llm = requireClient();
      const { text } = await fetchArticle(inputUrl);

      setPhase("analyzing");
      const result = await analyzeArticle(llm, text);

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
      const llm = requireClient();
      let assistantContent = "";

      for await (const delta of streamChatReply(llm, currentAnalysis, newHistory)) {
        assistantContent += delta;
        setMessages((prev) => {
          const msgs = [...prev];
          msgs[msgs.length - 1] = {
            role: "assistant",
            content: assistantContent,
          };
          return msgs;
        });
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
