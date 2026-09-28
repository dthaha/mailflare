/**
 * Where the app is running. On Cloudflare Workers the bindings come from
 * cloudflare:workers; the self-hosted Node server builds an equivalent env object and
 * publishes it on globalThis before Next starts, so route handlers reach it
 * the same way.
 */
declare global {
	var __mailflareNodeEnv: CloudflareEnv | undefined;
}

export function getNodeEnv(): CloudflareEnv | undefined {
	return globalThis.__mailflareNodeEnv;
}

export function isNodeRuntime(env?: Pick<CloudflareEnv, "MAILFLARE_RUNTIME">): boolean {
	return (env ?? getNodeEnv())?.MAILFLARE_RUNTIME === "node";
}

/**
 * This build never talks to the Cloudflare API, so the app holds no API token,
 * no global key and no account id. DNS and Email Routing belong to whoever runs
 * the nameservers: they are configured by hand in the dashboard, or declared for
 * Wrangler with the `addresses` field, and every domain Mailflare stores is
 * recorded as manually managed.
 *
 * Callers use this to decide whether they may configure a zone for you. It is a
 * function, and a constant, so those branches keep compiling and always take the
 * manual path.
 */
export function hasCloudflareCredentials(_env?: unknown): false {
	return false;
}
