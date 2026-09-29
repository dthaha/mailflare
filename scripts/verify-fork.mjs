#!/usr/bin/env node
// One verification command for the self-host fork: `npm run verify`.
//
// The same command is the Workers Builds deploy gate, whose build command is
// `npm run verify && npm run build`, and the same command runs in
// .github/workflows/verify.yml. Keep the check set in this file, not in the
// workflow, or the deploy gate and the PR gate drift apart.
//
// Steps, in order, stopping at the first step that fails:
//   1. npm run db:bundle        - the migration bundle the app imports at runtime
//   2. tsc --noEmit             - one-way delta against tests/tsc-baseline.txt
//   3. eslint .                 - one-way delta against tests/eslint-baseline.txt
//   4. node --test <file>       - every tests/*.test.mjs, minus two allowlisted
//                                 upstream failures; manual-dns-mode must pass
//
// Upstream is not clean, so steps 2 and 3 gate on a *delta* rather than on a
// clean tree: upstream c57671f (the commit this fork is based on) typechecks
// with 18 errors and lints with 63, none of which this fork caused or is going
// to fix. A diagnostic absent from the committed baseline fails; a baseline
// entry that no longer reproduces is reported as info, because the fork deletes
// upstream files and their diagnostics go with them. Referencing upstream at
// run time is not allowed: CI must not need the upstream repo to verify the
// fork, so the baselines are committed (see the header of each baseline file
// for how they were generated).
//
// Nothing here proves mail flows: the fork cannot be exercised end to end
// without a Cloudflare account and a real domain. This is a source-level gate.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TSC_BASELINE = path.join("tests", "tsc-baseline.txt");
const ESLINT_BASELINE = path.join("tests", "eslint-baseline.txt");

// KNOWN UPSTREAM TEST FAILURES (measured at the base commit c57671f, they fail
// on upstream/main too): tests/agent-email-tools.test.mjs cannot open its SQLite
// bundle, tests/setup-bootstrap-schema.test.mjs fails its python3 schema replay.
// Tolerated here and nowhere else. tests/manual-dns-mode.test.mjs is banned from
// this list on purpose: the fork invariants are the one thing that must hold.
const ALLOWED_TEST_FAILURES = new Set([
	"tests/agent-email-tools.test.mjs",
	"tests/setup-bootstrap-schema.test.mjs",
]);
const REQUIRED_TEST = "tests/manual-dns-mode.test.mjs";

const OUTPUT_LIMIT = 60;

function log(message = "") {
	process.stdout.write(`${message}\n`);
}

function section(name) {
	log("");
	log(`== ${name}`);
}

// Every line of captured tool output is indented before it is echoed: GitHub
// turns a bare `path(line,col): error TSxxxx:` line from any step - failing or
// not - into an error annotation, which makes a green run look red.
function echo(lines, limit = OUTPUT_LIMIT) {
	const shown = lines.slice(0, limit);
	for (const line of shown) log(`  ${line}`);
	if (lines.length > shown.length) log(`  ... ${lines.length - shown.length} more line(s)`);
}

function fail(message, detailLines = []) {
	log("");
	log(`FAIL: ${message}`);
	echo(detailLines);
	process.exit(1);
}

function run(command, args) {
	return spawnSync(command, args, {
		cwd: ROOT,
		encoding: "utf8",
		env: process.env,
		maxBuffer: 64 * 1024 * 1024,
	});
}

function localBin(name) {
	return path.join(ROOT, "node_modules", ".bin", name);
}

// `npm run db:bundle` has to go through npm; the npm that invoked this script is
// known from npm_execpath, which also survives an npm that is not on PATH.
function runNpm(args) {
	const execpath = process.env.npm_execpath;
	if (execpath && existsSync(execpath)) return run(process.execPath, [execpath, ...args]);
	return run("npm", args);
}

function baselineLines(relativePath) {
	const absolute = path.join(ROOT, relativePath);
	if (!existsSync(absolute)) fail(`${relativePath} is missing; the baseline is committed with the repo`);
	return readFileSync(absolute, "utf8")
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line !== "" && !line.startsWith("#"));
}

// Byte order (`LC_ALL=C` equivalent), so the committed baselines and the
// in-memory comparison can never disagree about order.
function sortLines(lines) {
	return [...lines].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function stepBundle() {
	section("migration bundle (npm run db:bundle)");
	const result = runNpm(["run", "db:bundle"]);
	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.split("\n").filter(Boolean);
	if (result.error || result.status !== 0) {
		fail("npm run db:bundle failed", output);
	}
	echo(output.slice(-3));
	log("  ok");
}

function stepTypecheck() {
	section(`typecheck (tsc --noEmit vs ${TSC_BASELINE})`);
	const tsc = localBin("tsc");
	if (!existsSync(tsc)) fail("node_modules/.bin/tsc is missing; run `npm ci --ignore-scripts` first");

	const result = run(tsc, ["--noEmit"]);
	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	if (result.error) fail(`could not run tsc: ${result.error.message}`, output.split("\n"));

	// Continuation lines (the indented "Overload 1 of 2" notes) carry no error
	// code, so the gate compares real diagnostics only.
	const reported = sortLines(
		output
			.split("\n")
			.map((line) => line.trimEnd())
			.filter((line) => line.includes("error TS")),
	);
	if (reported.length === 0 && result.status !== 0) {
		fail("tsc failed without reporting a single `error TS` diagnostic", output.split("\n"));
	}

	const baseline = baselineLines(TSC_BASELINE);
	const baselineSet = new Set(baseline);
	const reportedSet = new Set(reported);
	const added = reported.filter((line) => !baselineSet.has(line));
	const gone = baseline.filter((line) => !reportedSet.has(line));

	if (added.length > 0) {
		fail(
			`tsc reports ${added.length} type error(s) that are not in ${TSC_BASELINE}:`,
			added.map((line) => `new: ${line}`),
		);
	}
	if (gone.length > 0) {
		log(`  info: ${gone.length} baseline error(s) no longer reproduced (expected where the fork deleted upstream code)`);
		echo(gone.map((line) => `gone: ${line}`), 10);
	}
	log(`  ok - ${reported.length} known type error(s), no new ones`);
}

function stepLint() {
	section(`lint (eslint . errors vs ${ESLINT_BASELINE})`);
	const eslint = localBin("eslint");
	if (!existsSync(eslint)) fail("node_modules/.bin/eslint is missing; run `npm ci --ignore-scripts` first");

	const result = run(eslint, [".", "--format", "json"]);
	if (result.error) fail(`could not run eslint: ${result.error.message}`);

	let report;
	try {
		report = JSON.parse(result.stdout ?? "");
	} catch {
		fail("eslint did not report JSON", (result.stdout ?? result.stderr ?? "").split("\n"));
	}
	if (result.status > 1) {
		fail("eslint failed internally", (result.stderr ?? "").split("\n"));
	}

	// Identity is (file, rule, severity, first line of the message): line and
	// column numbers move with any edit, so they are not part of it, and the
	// message keeps a rule that fires for a new reason from hiding behind a
	// known one. Occurrence counts are deliberately not tracked.
	const errors = new Set();
	let warnings = 0;
	for (const file of report) {
		const relative = path.relative(ROOT, file.filePath).split(path.sep).join("/");
		for (const message of file.messages) {
			if (message.severity !== 2) {
				warnings += 1;
				continue;
			}
			errors.add(
				[relative, message.ruleId ?? "<fatal>", "error", (message.message ?? "").split("\n")[0]].join("\t"),
			);
		}
	}

	const baseline = baselineLines(ESLINT_BASELINE);
	const baselineSet = new Set(baseline);
	const added = sortLines([...errors].filter((identity) => !baselineSet.has(identity)));
	const gone = baseline.filter((identity) => !errors.has(identity));

	if (added.length > 0) {
		fail(
			`eslint reports ${added.length} error(s) that are not in ${ESLINT_BASELINE}:`,
			added.map((identity) => `new: ${identity.replace(/\t/g, " | ")}`),
		);
	}
	if (gone.length > 0) {
		log(`  info: ${gone.length} baseline error(s) no longer reproduced (expected where the fork fixed or deleted upstream code)`);
		echo(gone.map((identity) => `gone: ${identity.replace(/\t/g, " | ")}`), 10);
	}
	log(`  ok - ${errors.size} known error(s), no new ones; ${warnings} warning(s) ignored`);
}

function stepTests() {
	section("tests (node --test, one file at a time)");
	const testsDir = path.join(ROOT, "tests");
	const files = readdirSync(testsDir)
		.filter((name) => name.endsWith(".test.mjs"))
		.sort()
		.map((name) => `tests/${name}`);

	if (ALLOWED_TEST_FAILURES.has(REQUIRED_TEST)) {
		fail(`${REQUIRED_TEST} must never be allowlisted as an upstream failure`);
	}
	if (!files.includes(REQUIRED_TEST)) {
		fail(`${REQUIRED_TEST} is gone; nothing guards the fork invariants`);
	}

	const failed = [];
	for (const file of files) {
		const result = run(process.execPath, ["--test", file]);
		if (result.status === 0) {
			log(`  ok    ${file}`);
			continue;
		}
		if (ALLOWED_TEST_FAILURES.has(file)) {
			log(`  skip  ${file} - fails on the upstream base too, tolerated`);
			continue;
		}
		log(`  FAIL  ${file}`);
		failed.push({ file, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.split("\n").filter(Boolean) });
	}

	if (failed.length > 0) {
		log("");
		for (const { file, output } of failed) {
			log(`${file}:`);
			echo(output.slice(-OUTPUT_LIMIT));
		}
		fail(`${failed.length} test file(s) failed: ${failed.map(({ file }) => file).join(", ")}`);
	}
	log(`  ok - ${files.length} file(s), ${ALLOWED_TEST_FAILURES.size} tolerated upstream failure(s)`);
}

function main() {
	log(`verify (${ROOT})`);
	if (!existsSync(path.join(ROOT, "node_modules"))) {
		fail("node_modules is missing; run `npm ci --ignore-scripts` first");
	}
	stepBundle();
	stepTypecheck();
	stepLint();
	stepTests();
	log("");
	log("verify: ok");
}

main();
