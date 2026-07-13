ALTER TABLE sites ADD COLUMN record_ip INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sites ADD COLUMN ip_retention_days INTEGER NOT NULL DEFAULT 60;

CREATE TABLE IF NOT EXISTS visits (
    site_id TEXT NOT NULL,
    visit_id TEXT NOT NULL,
    visitor_id TEXT,
    identity_scope TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    entry_host TEXT,
    entry_path TEXT,
    entry_referrer TEXT,
    country TEXT,
    region TEXT,
    city TEXT,
    region_code TEXT,
    latitude REAL,
    longitude REAL,
    user_agent TEXT,
    ip_family INTEGER,
    ip_ciphertext TEXT,
    ip_nonce TEXT,
    ip_key_version INTEGER,
    ip_hmac TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (site_id, visit_id)
);

CREATE TABLE IF NOT EXISTS pageviews (
    pageview_id TEXT PRIMARY KEY NOT NULL,
    site_id TEXT NOT NULL,
    visit_id TEXT NOT NULL,
    tab_id TEXT,
    occurred_at TEXT NOT NULL,
    client_time INTEGER,
    host TEXT,
    path TEXT,
    referrer TEXT,
    country TEXT,
    region TEXT,
    city TEXT,
    region_code TEXT,
    latitude REAL,
    longitude REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (site_id, visit_id) REFERENCES visits(site_id, visit_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS visit_ip_prefixes (
    site_id TEXT NOT NULL,
    visit_id TEXT NOT NULL,
    prefix_length INTEGER NOT NULL,
    prefix_token TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (site_id, visit_id, prefix_length),
    FOREIGN KEY (site_id, visit_id) REFERENCES visits(site_id, visit_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_visits_site_last_seen ON visits(site_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_site_expires ON visits(site_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_visits_site_ip_hmac ON visits(site_id, ip_hmac);
CREATE INDEX IF NOT EXISTS idx_visits_site_geo ON visits(site_id, country, region, city);
CREATE INDEX IF NOT EXISTS idx_pageviews_visit_time ON pageviews(site_id, visit_id, occurred_at ASC);
CREATE INDEX IF NOT EXISTS idx_pageviews_site_time ON pageviews(site_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_visit_ip_prefixes_lookup ON visit_ip_prefixes(site_id, prefix_length, prefix_token);