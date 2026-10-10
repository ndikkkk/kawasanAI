export const AVAILABLE_MODELS = [
  "gpt-6-astra",
  "gpt-6.1-sol",
  "gpt-6-sol",
  "gpt-6-luna",
  "gpt-5.4-mini",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "deepseek-v4.1-flash",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "glm-5.2",
  "glm-5.3",
  "glm-5.3-flash",
  "kimi-k3",
  "kimi-k2.7-code",
  "qwen-3-8-max",
  "qwen3-coder",
  "qwen3.8-flash",
] as const;

export type ModelId = (typeof AVAILABLE_MODELS)[number];

export function isAvailableModel(value: unknown): value is ModelId {
  return typeof value === "string" && AVAILABLE_MODELS.includes(value as ModelId);
}