import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

function sourceFiles(dir = "src", found = []) {
	for (const entry of readdirSync(join(root, dir))) {
		const relative = join(dir, entry);
		if (statSync(join(root, relative)).isDirectory()) sourceFiles(relative, found);
		else if (/\.(ts|tsx)$/.test(entry)) found.push(relative);
	}
	return found;
}

test("no source file calls the Cloudflare API", () => {
	// https://cloudflare-dns.com/dns-query in src/lib/dns-query.ts is a public
	// DNS-over-HTTPS resolver, not the account API, and is the only allowed host.
	const offenders = sourceFiles()
		.filter((file) => file !== "src/lib/dns-query.ts")
		.filter((file) => /api\.cloudflare\.com/.test(read(file)));
	assert.deepEqual(offenders, [], `these files talk to the Cloudflare API: ${offenders.join(", ")}`);
});

test("the env declares no Cloudflare credentials", () => {
	const env = read("env.d.ts");
	for (const name of ["CF_TOKEN", "CF_API_KEY", "CF_EMAIL", "CF_ACCOUNT_ID"]) {
		assert.ok(!new RegExp(`\\b${name}\\b`).test(env), `env.d.ts must not declare ${name}`);
	}
});

test("the API shim cannot authenticate or build a request", () => {
	const shim = read("src/lib/cloudflare-api.ts");
	assert.match(shim, /export function cfRequest\b/, "cfRequest stays as the tripwire");
	assert.doesNotMatch(shim, /Authorization/i, "no auth header may be constructed");
	assert.doesNotMatch(shim, /fetch\(/, "the shim must not perform requests");
	assert.match(shim, /export async function ensureEmailRoutingRuleToWorker/, "mailbox paths keep their no-op");
});

test("provisioning records every domain as manually managed", () => {
	const src = read("src/lib/domains/provision.ts");
	assert.match(src, /export const MANUAL_ZONE_ID = "manual"/);
	assert.match(src, /zone: \{ id: MANUAL_ZONE_ID, name: normalized \}/);
	assert.doesNotMatch(src, /@\/lib\/cloudflare-api/, "provisioning must not import the API client");
	assert.doesNotMatch(src, /hasCloudflareCredentials/, "there is no credential branch left");
});

test("the entitlement layer is local and always on", () => {
	const service = read("src/lib/licenses/service.ts");
	assert.doesNotMatch(service, /fetch\(/, "licensing must not call out");
	assert.match(service, /canManageAccounts: true/);
	assert.match(service, /canCustomizeBranding: true/);
	assert.match(service, /canForwardEmail: true/);
	assert.ok(
		!/paymug/i.test(sourceFiles().map(read).join("\n")),
		"no source file may reference the upstream licensing service",
	);
});
