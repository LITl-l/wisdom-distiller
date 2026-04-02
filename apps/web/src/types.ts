export type Phase = "input" | "fetching" | "analyzing" | "session" | "error";

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
