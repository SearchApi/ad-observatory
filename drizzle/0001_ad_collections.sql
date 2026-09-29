CREATE TABLE ad_collections (id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE INDEX ad_collections_owner ON ad_collections (owner, archived);
--> statement-breakpoint
CREATE TABLE ad_collection_items (collection_id TEXT NOT NULL REFERENCES ad_collections(id), ad_id TEXT NOT NULL, value TEXT NOT NULL, saved_at TEXT NOT NULL, removed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (collection_id, ad_id));
