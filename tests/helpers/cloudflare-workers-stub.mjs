/**
 * Test double for the Workers `cloudflare:workers` module.
 *
 * The bundle is built with this file aliased in place of the real module, so
 * `getEnv()` (`src/lib/cloudflare.ts`) hands the application the object the test
 * fills in. It reads the object off `globalThis` so the copy esbuild inlines
 * into the bundle and the copy the test imports are the same object.
 */
export const env = (globalThis.__mailflareTestEnv ??= {});
