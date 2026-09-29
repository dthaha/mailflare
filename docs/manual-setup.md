# Manual setup: DNS and Email Routing

This build does not manage Cloudflare for you. It holds no API token, no account
id and no global key, so there is nothing it can change — or break — in your
account. Everything a domain needs is a dashboard step or a line of configuration
you write, and the app verifies the result by looking the records up in public
DNS instead of trusting an API.

The trade is deliberate: the features that disappear (automatic Email Routing
provisioning, MX conflict cleanup, sending-subdomain creation, rollback of
half-applied zone changes) are the ones that require writing to your zone. What
remains is a mail server that stores mail and tells you exactly what DNS has to
say for mail to arrive and leave.

## 1. Deploy the Worker

Use the **Deploy to Cloudflare** button or `npm run deploy`. Name the Worker
`mailflare` (or set `EMAIL_WORKER_NAME` to whatever you called it). There is no
`CF_TOKEN` to provide and no token permission list to get right.

The bindings that matter are already in `wrangler.jsonc`: `DB` (D1), `BUCKET`
(R2), the three Queues, the `RealtimeHub` Durable Object, and the `EMAIL`
`send_email` binding used for outbound mail.

## 2. Give hafamily.tech to Email Routing

In the Cloudflare dashboard: **Compute → Email Service → Email Routing**, select
**Onboard Domain**, and pick `hafamily.tech` — the apex, not a subdomain. Cloudflare
writes the DNS records for you:

| Type | Name | Value |
| --- | --- | --- |
| MX | `@` | `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`, `route3.mx.cloudflare.net` |
| TXT | `@` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| TXT | `cf2024-1._domainkey` | the DKIM key shown under **Email Routing → Settings** |
| TXT | `_dmarc` | `v=DMARC1; p=none` (Cloudflare writes this too) |

`hafamily.tech` currently points mail at Microsoft 365, and those records have to
go before Email Routing can take over:

- MX `@` → `hafamily-tech.mail.protection.outlook.com` — delete it. Email Routing
  needs exclusive control of the domain's MX records, so mail keeps going to the
  old provider for as long as a competing MX exists. This build will not touch
  your records for you.
- TXT `@` → `v=spf1 include:spf.protection.outlook.com -all` — delete it. The
  `-all` hardfail rejects everything the SPF record does not list, which includes
  Cloudflare's sending infrastructure, so outbound mail from `@hafamily.tech`
  would fail SPF at the recipient. Cloudflare's own SPF
  (`v=spf1 include:_spf.mx.cloudflare.net ~all`) replaces it.

Relaxing rather than deleting the old SPF would work too — `-all` → `~all` and an
added `include:_spf.mx.cloudflare.net` — but the Microsoft include is dead weight
once mail no longer flows through M365, so deleting is the honest option.

## 3. Point the addresses at this Worker

Add a routing rule (**Email Routing → Routing Rules → Create routing rule**) with
**Action: Send to a Worker** and **Worker: mailflare**. Enabling the
**Catch-all rule** with the same action covers every address on the apex, which is
what you want for a mail server that decides for itself which mailboxes exist.

The catch-all is already declared in `wrangler.jsonc`, so `npm run deploy`
reconciles it (Wrangler 4.113.0 or newer):

```jsonc
{
	"addresses": ["*@hafamily.tech"]
}
```

Wrangler creates a rule for each literal address and treats `*@domain` as the
catch-all; the set in the file becomes the set in the account on every deploy.

Add `hafamily.tech` in Mailflare (**Admin → Domains**) and it is live as soon as a
message arrives.

### Adding a mailbox needs no DNS change

Because the catch-all covers `*@hafamily.tech`, a new address — `schools@`,
`billing@`, anything — is a row in Mailflare and nothing else. No routing rule, no
DNS record, no deploy: the Worker receives the message either way and the app
decides whether a mailbox exists for it. That is the payoff of onboarding the apex
instead of a subdomain, where every new address would be a new rule to reconcile.

## 4. Sending (optional)

Outbound mail uses the `send_email` binding, which needs the domain onboarded to
**Email Sending** (**Compute → Email Service → Email Sending → Onboard Domain**).
Onboard `hafamily.tech` again — outbound goes out as the same apex address mail
arrives at, `@hafamily.tech`, so the routing DKIM, the `cf-bounce` records and the
DMARC record all belong on the one domain. Cloudflare writes:

| Type | Name | Value |
| --- | --- | --- |
| MX | `cf-bounce` | `route1.mx.cloudflare.net` (priority 10) |
| TXT | `cf-bounce` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| TXT | `cf-bounce._domainkey` | the DKIM key shown under **Email Sending → Settings** |

Sending requires a paid Workers plan.

Mailflare renders those records on the domain page and reports sending as
configured only when `cf-bounce._domainkey.hafamily.tech` resolves in public DNS.

## 5. Verify

**Admin → Domains → DNS** shows four checks — MX, SPF, DKIM, DMARC — resolved
over DNS-over-HTTPS from a public resolver. They report what the internet sees,
which is the same thing a receiving mail server sees. Nothing in this
verification path needs credentials, and nothing in the app writes DNS.

## What about the DNS page's other buttons?

There are none. The per-record **Setup** button that upstream uses to create
records through the API is disabled for every domain in this build.

## Licensing

There is none to do. Upstream gates account management, branding and forwarding
behind Pro/Team keys validated against a third-party licensing service; this
build's entitlement layer always returns Team, calls nothing, and stores no key
hash or installation identifier. See `src/lib/licenses/service.ts`.
