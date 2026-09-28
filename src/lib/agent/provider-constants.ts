import type { AgentProviderPreset } from "./provider-types";

export const AGENT_SETTINGS_ID = "default";
// This build defaults to a US-origin model on Workers AI; Kimi, Qwen and others
// stay selectable in the model list.
export const DEFAULT_CLOUDFLARE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const PROVIDER_BASE_URLS: Record<Exclude<AgentProviderPreset, "custom">, string> = {
	openai: "https://api.openai.com/v1",
	openrouter: "https://openrouter.ai/api/v1",
	groq: "https://api.groq.com/openai/v1",
};
