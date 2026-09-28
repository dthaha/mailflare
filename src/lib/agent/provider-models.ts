import type { AgentModelOption, AgentProviderPreset } from "./provider-types";
import { getAgentProviderConfig, resolveAgentBaseUrl } from "./provider";

/**
 * The Workers AI models offered when nothing else is configured. This build has
 * no Cloudflare token, so the account's model catalog cannot be read; the list
 * is fixed and the default comes from provider-constants.
 */
export const CLOUDFLARE_TOOL_MODELS: AgentModelOption[] = [
	{ id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", name: "Llama 3.3 70B" },
	{ id: "@cf/qwen/qwen3-30b-a3b-fp8", name: "Qwen3 30B" },
	{ id: "@cf/moonshotai/kimi-k2.5", name: "Kimi K2.5" },
];

export async function listCloudflareAgentModels(_env?: unknown): Promise<{ models: AgentModelOption[]; source: "catalog" | "suggested" }> {
	return { models: CLOUDFLARE_TOOL_MODELS, source: "suggested" };
}

export async function listCompatibleAgentModels(env: CloudflareEnv, input: { preset: AgentProviderPreset; baseUrl: string; apiKey?: string }) {
	const baseUrl = resolveAgentBaseUrl(input.preset, input.baseUrl);
	const saved = await getAgentProviderConfig(env);
	const key = input.apiKey?.trim() || (saved.provider === "compatible" && saved.preset === input.preset && saved.baseUrl === baseUrl ? saved.apiKey : "");
	if (!key) throw new Error("Enter an API key to load models");
	const response = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(10_000), redirect: "error" });
	if (!response.ok) throw new Error(`Model list request failed (${response.status})`);
	const json = await response.json() as { data?: { id?: unknown; name?: unknown }[] };
	const models = (json.data ?? []).filter((item) => typeof item.id === "string" && item.id.length <= 200).map((item) => ({ id: item.id as string, name: typeof item.name === "string" ? item.name : item.id as string })).slice(0, 2_000).sort((a, b) => a.name.localeCompare(b.name));
	if (!models.length) throw new Error("Provider returned no models");
	return { models, source: "catalog" as const };
}
