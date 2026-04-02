export type Analysis = {
  title: string;
  pain_points: string[];
  cognitive_traps: string[];
  turning_point: string;
  first_question: string;
};

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type FetchRequest = {
  url: string;
};

export type FetchResponse = {
  text: string;
  title: string;
};

export type AnalyzeRequest = {
  text: string;
};

export type ChatRequest = {
  analysis: Analysis;
  history: Message[];
};
