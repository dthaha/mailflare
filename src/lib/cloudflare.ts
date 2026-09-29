import { env } from "cloudflare:workers";

export function getEnv(): CloudflareEnv {
	return env as CloudflareEnv;
}

export async function getEnvAsync(): Promise<CloudflareEnv> {
	return getEnv();
}
