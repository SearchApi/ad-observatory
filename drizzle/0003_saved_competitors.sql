CREATE TABLE saved_competitors (
 owner TEXT NOT NULL,
 page_id TEXT NOT NULL,
 name TEXT NOT NULL,
 page_url TEXT NOT NULL,
 country TEXT NOT NULL,
 saved_at TEXT NOT NULL,
 PRIMARY KEY (owner, page_id)
);
