# Deployment and configuration

This guide covers Cloudflare deployment, runtime configuration, database backups, and application updates.

## Overview

Set up Mailflare in three steps:

1. **Deploy the app:** use the Deploy to Cloudflare button and set the app name to `mailflare`. There is no API token to provide.
2. **Complete setup:** open the deployed app and follow `/setup` to check the installation and create the first admin account.
3. **Connect your domain:** add the domain in Mailflare, then do the two Cloudflare-side steps by hand — onboard it to Email Routing and point its addresses at this Worker. See [Manual setup](./manual-setup.md).

The Worker name must remain `mailflare` (or set `EMAIL_WORKER_NAME` to whatever you call it) because Email Routing rules point at it by name. This build holds no Cloudflare credentials: it never reads or writes your DNS, your Email Routing rules or your sending subdomains, so there are no token permissions to configure and nothing it can break in your account.

## Step 1: Deploy mailflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/hieunc229/mailflare)

1. Click **Deploy to Cloudflare** above and sign in to Cloudflare if prompted.
2. Choose the Cloudflare account that owns the domain you want to use.
3. Set the app name to exactly `mailflare`. Do not rename it.
4. Skip the variables and secrets step: this build needs none. (Optional extras are listed in `.dev.vars.example`.)
5. Start the deployment and wait for Cloudflare to finish provisioning and deploying the Worker.

### Required configuration

None. The Worker needs its bindings from `wrangler.jsonc` and nothing else; D1 migrations are applied through the `DB` binding during setup.

Optional runtime values are documented in `.dev.vars.example` (Turnstile for the registration form, a GitHub token for the in-dashboard updater, a model override for the assistant).

There is no app token to paste. Make sure the domain uses Cloudflare DNS, since Email Routing requires it, and note that Email Routing and another mail provider cannot share the same MX records — whoever owns them wins.

## Step 2: Complete mailflare setup

1. Open the URL of the deployed `mailflare` Worker.
2. Go to `/setup` if Mailflare does not take you there automatically.
3. Let Mailflare check the required Cloudflare configuration and initialize the empty D1 database.
4. Create the first admin account when prompted.

Setup applies the committed migrations through the Worker's D1 binding before creating the first admin account.

## Step 3: Connect your primary domain and create an account

1. Enter a domain that already uses Cloudflare DNS.
2. Continue while Mailflare enables Email Routing and configures the required routing and sending DNS.
3. Choose the address for your first mailbox and finish setup.
4. Open the inbox and send a test message to the new address.

To connect more domains later, open **Admin → Domains**, select **New domain**, and enter the hostname. Mailflare configures Email Routing and Email Sending automatically.

Your inbox should be ready to send and receive emails

---

## Manual deployment

Install dependencies, configure the Cloudflare bindings in `wrangler.jsonc`, and run:

```bash
npm install
npm run deploy:local
```

The local deploy command builds with vinext and uploads the complete Worker with Wrangler. The Cloudflare Vite plugin generates `dist/server/wrangler.json` and redirects Wrangler to that build. It does not modify D1. The complete Worker is required because `worker.ts` also handles inbound email, queues, scheduled backups, and the real-time Durable Object.

For manual recovery, pending migrations can still be applied with:

```bash
npm run db:migrate:remote
```

Remote migrations require the target account's `database_id` in your local `wrangler.jsonc`. Do not commit an account-specific database ID to a reusable repository.

## Database backups

Mailflare exports its D1 records as JSON and stores the backup files in the configured R2 bucket. A cron trigger in `wrangler.jsonc` runs daily at 02:00 UTC and applies the schedule selected under **Admin → Backups**. Manual backups run the same record export directly from the admin API.

Deploy the complete Worker with `npm run deploy` whenever the cron trigger is added or changed.

After upgrading an existing installation and confirming the cron trigger is active, the old Workflow can be removed with `npx wrangler workflows delete mailflare-database-backup`. Deleting it also removes its historical Workflow instances; backup files in R2 and rows in Mailflare's backup history are unaffected.

## Email assistant and MCP

The assistant uses the Workers AI `AI` binding and a separate `mailflare-agent` queue. Provision the queue in the Cloudflare account before deploying a configuration that declares it, and apply migration `0032_add_agentic_mail.sql` before opening the new UI on an existing database. The five-minute cron recovers pending auto-draft work; the 02:00 UTC cron still runs backups.

In the inbox, open **Assistant → Settings** for a mailbox, select its reviewer, and enable the assistant. Auto-drafting is a separate opt-in. It skips spam, automated mail, and mailboxes with out-of-office replies enabled. Generated replies appear as ordinary drafts assigned to the reviewer. The reviewer must open the draft and confirm the exact content before delivery.

The assistant panel no longer exposes MCP key management. External MCP clients can still connect to `https://<your-mailflare-origin>/mcp` with a mailbox-scoped Bearer key created through the authenticated `/api/agent/mcp-keys` endpoint. Keys can be listed and revoked through that endpoint; a new key is shown only once. The server uses Streamable HTTP and accepts clients that can set a Bearer header. Its `request_send` tool returns a Mailflare review URL; the MCP key cannot confirm or deliver messages directly. MCP does not require Workers AI for read and draft tools.

## Updating Mailflare

The **Update Mailflare** button in the admin dashboard dispatches `.github/workflows/deploy-update.yml` in the installation repository. The workflow replaces the installation branch's complete tracked tree with the latest upstream source, commits that replacement, and pushes it. This avoids merge conflicts between independently created installation and upstream histories. Target-only committed files and code changes are intentionally removed; repository variables, secrets, and other GitHub or Cloudflare configuration remain unchanged. A connected Cloudflare Git integration then builds and deploys the change.

### Auto update

Create a fine-grained personal access token for the installation repository with these repository permissions:

| Permission | Access | Used for |
| --- | --- | --- |
| Actions | Read and write | Dispatching `deploy-update.yml` from the Mailflare admin dashboard |
| Contents | Read and write | Committing and pushing the upstream source into the installation repository |
| Workflows | Read and write | Replacing files inside `.github/workflows` during an update |

Configure the token and repository details in both Cloudflare and GitHub:

| Location | Name | Type | Value |
| --- | --- | --- | --- |
| Cloudflare Worker | `GITHUB_UPDATE_TOKEN` | Secret | The fine-grained personal access token |
| Cloudflare Worker | `GITHUB_UPDATE_REPO` | Variable | The installation repository in `owner/repository` format |
| Cloudflare Worker | `GITHUB_UPDATE_REF` | Optional variable | The installation branch to update; omit it to use the repository's default branch |
| GitHub repository → Actions | `MAILFLARE_UPDATE_TOKEN` | Repository secret | The same fine-grained personal access token |
| GitHub repository → Actions | `UPDATE_SOURCE_REPOSITORY` | Optional repository variable | The upstream repository; defaults to `hieunc229/mailflare` |

The same token can be used for `GITHUB_UPDATE_TOKEN` and `MAILFLARE_UPDATE_TOKEN` when it has all three permissions above. Keep both values secret and limit the token's repository access to the installation repository.

Make sure `.github/workflows/deploy-update.yml` exists on the installation branch. If it is missing, create the file and copy its contents from the [canonical Mailflare update workflow](https://github.com/hieunc229/mailflare/blob/main/.github/workflows/deploy-update.yml). If an older installation has a different updater, replace it with the latest canonical workflow once. A running workflow cannot create or replace itself until the current workflow has been installed manually.

After the GitHub Action completes successfully, wait for the connected Cloudflare deployment to finish before refreshing Mailflare or applying pending database migrations. The workflow updates the repository first; the new application version is not live until Cloudflare completes its deployment.

Deployment and database migration are separate. After Cloudflare deploys a repository push or an admin-triggered update, open or refresh **Admin settings**. The application update card shows any pending database migrations. Select **Update database** to apply them through the Worker's D1 binding. The same runner initializes a new database during setup.

If the Cloudflare dashboard has a custom deploy command containing `wrangler d1 migrations apply DB --remote`, remove that part and use `npm run deploy`.

Each migration and its `d1_migrations` history entry run in one D1 batch. If a migration fails, its changes are rolled back, the failed filename is shown, and it can be retried after the problem is corrected. Wrangler remains available as a manual recovery tool.

New application releases must remain compatible with the previous schema until an administrator applies their migrations. Prefer additive changes, keep old columns during the transition, and avoid making authentication or the admin settings page depend immediately on a newly added column. Plan a maintenance window for an incompatible schema change.

When adding a schema change, create a new uniquely named SQL file in `drizzle/migrations` and do not edit an applied migration. Build and development commands generate the Worker migration bundle from those files. `npm run db:bundle` can generate it explicitly.

## Licensing

None required. This build's entitlement layer returns Team unconditionally, so branding, forwarding, shared inboxes and multi-user account management are all enabled, no key is validated and no installation identifier leaves the Worker. **Admin → Licenses** explains this in the UI.
