/**
 * There is no Cloudflare API client in this build.
 *
 * Mailflare stores mail; it does not own your DNS or your Email Routing config.
 * The operator points MX at Cloudflare Email Routing and creates the routing
 * rule (dashboard, or the `addresses` field in wrangler.jsonc) that sends mail
 * to this Worker, so nothing here can read or write a zone and no credential is
 * ever held at runtime.
 *
 * The two routing helpers below survive as explicit no-ops because mailbox and
 * account code calls them on every create: with manual zones there is no rule to
 * create or delete, and each call has always been safe to skip.
 */

export class CloudflareApiDisabledError extends Error {
	constructor(path: string) {
		super(
			`This build manages DNS and Email Routing manually, so it does not call the Cloudflare API (${path}).`,
		);
		this.name = "CloudflareApiDisabledError";
	}
}

/** Kept as a tripwire: any future call site fails loudly instead of silently doing nothing. */
export function cfRequest(_env: unknown, path: string, _init?: RequestInit): Promise<never> {
	return Promise.reject(new CloudflareApiDisabledError(path));
}

export async function ensureEmailRoutingRuleToWorker(
	_env: unknown,
	_zoneId: string,
	_address: string,
): Promise<null> {
	return null;
}

export async function deleteEmailRoutingRuleForAddress(
	_env: unknown,
	_zoneId: string,
	_address: string,
): Promise<boolean> {
	return false;
}
