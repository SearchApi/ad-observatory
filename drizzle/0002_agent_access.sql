CREATE TABLE agent_tokens (owner TEXT PRIMARY KEY NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE owned_captures (owner TEXT NOT NULL, id TEXT NOT NULL, page_id TEXT NOT NULL, captured_at TEXT NOT NULL, value TEXT NOT NULL, provenance TEXT NOT NULL, PRIMARY KEY (owner,id));
--> statement-breakpoint
CREATE INDEX owned_captures_time ON owned_captures (owner,captured_at DESC,id);
