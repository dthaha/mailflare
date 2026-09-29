import { readFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * A D1-shaped database over Node's built-in SQLite, for tests.
 *
 * This is a test fixture, not a runtime: the fork ships on Cloudflare Workers
 * only. Drizzle's D1 driver and the app's raw `env.DB.prepare(...)` calls both
 * go through this, so a test sees the same schema, migrations, FTS index and
 * triggers that a Cloudflare deploy would build.
 */

function meta(info) {
	const changes = info?.changes ?? 0;
	return {
		duration: 0,
		size_after: 0,
		rows_read: 0,
		rows_written: changes,
		last_row_id: Number(info?.lastInsertRowid ?? 0),
		changed_db: changes > 0,
		changes,
	};
}

function normalizeParam(value) {
	if (value === undefined) return null;
	if (value instanceof Date) return Math.floor(value.getTime() / 1000);
	if (typeof value === "boolean") return value ? 1 : 0;
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	return value;
}

class SqlitePreparedStatement {
	constructor(db, sql, params = []) {
		this.db = db;
		this.sql = sql;
		this.params = params;
	}

	bind(...values) {
		return new SqlitePreparedStatement(this.db, this.sql, values.map(normalizeParam));
	}

	statement() {
		return this.db.prepare(this.sql);
	}

	isRead() {
		return /^\s*(select|with|pragma|explain)\b/i.test(this.sql) || /\breturning\b/i.test(this.sql);
	}

	async first(column) {
		const row = this.statement().get(...this.params);
		if (row === undefined) return null;
		return column ? row[column] : row;
	}

	async run() {
		if (this.isRead()) {
			const results = this.statement().all(...this.params);
			return { results, success: true, meta: meta() };
		}
		const info = this.statement().run(...this.params);
		return { results: [], success: true, meta: meta(info) };
	}

	async all() {
		return this.run();
	}

	async raw(options) {
		if (!this.isRead()) {
			this.statement().run(...this.params);
			return [];
		}
		const statement = this.statement();
		const names = statement.columns().map((column) => column.name);
		const rows = statement.all(...this.params).map((row) => names.map((name) => row[name]));
		if (options?.columnNames) return [names, ...rows];
		return rows;
	}
}

export class SqliteDatabase {
	constructor(filename) {
		this.filename = filename;
		this.db = new DatabaseSync(filename);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec("PRAGMA foreign_keys = ON");
		this.db.exec("PRAGMA busy_timeout = 5000");
	}

	prepare(sql) {
		return new SqlitePreparedStatement(this.db, sql);
	}

	/** Run statements atomically, like D1's batch. */
	async batch(statements) {
		const results = [];
		this.db.exec("BEGIN");
		try {
			for (const statement of statements) results.push(await statement.all());
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
		return results;
	}

	async exec(sql) {
		this.db.exec(sql);
		return { count: 0, duration: 0 };
	}

	async dump() {
		const buffer = readFileSync(this.filename);
		return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
	}

	withSession() {
		return this;
	}
}

/**
 * Apply the repository's D1 migrations to a local database in journal order,
 * recording them in `d1_migrations` exactly as Wrangler does.
 */
export async function applyMigrations(database, migrationsDir) {
	const db = database.db;
	db.exec(
		"CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
	);
	const applied = new Set(db.prepare("SELECT name FROM d1_migrations").all().map((row) => row.name));

	let order;
	try {
		const journal = JSON.parse(await readFile(join(migrationsDir, "meta", "_journal.json"), "utf8"));
		order = journal.entries.map((entry) => `${entry.tag}.sql`);
	} catch {
		order = [];
	}
	const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
	// Anything the journal does not list (hand-written migrations) runs after it, in name order.
	const names = [...order.filter((name) => files.includes(name)), ...files.filter((name) => !order.includes(name))];

	const ran = [];
	for (const name of names) {
		if (applied.has(name)) continue;
		const sql = await readFile(join(migrationsDir, name), "utf8");
		const statements = sql
			.split(/-->\s*statement-breakpoint/g)
			.map((statement) => statement.trim())
			.filter((statement) => (statement && !/^--/.test(statement.replace(/\n.*/gs, ""))) || statement.includes("\n"));
		db.exec("BEGIN");
		try {
			for (const statement of statements) {
				const clean = statement.replace(/^\s*--.*$/gm, "").trim();
				if (clean) db.exec(clean);
			}
			db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(name);
			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw new Error(`Migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`);
		}
		ran.push(name);
	}
	return ran;
}
