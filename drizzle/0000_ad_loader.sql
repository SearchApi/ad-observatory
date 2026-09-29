CREATE TABLE ad_cache (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX ad_cache_expiry ON ad_cache (expires_at);
--> statement-breakpoint
CREATE TABLE ad_budget (key TEXT PRIMARY KEY NOT NULL, used INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE ad_locks (key TEXT PRIMARY KEY NOT NULL, expires_at INTEGER NOT NULL);
