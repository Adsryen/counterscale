ALTER TABLE pageviews ADD COLUMN client_pageview_id TEXT;
ALTER TABLE pageviews ADD COLUMN visible_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pageviews ADD COLUMN last_engaged_at TEXT;
ALTER TABLE pageviews ADD COLUMN engagement_flushes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE visits ADD COLUMN engaged_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE visits ADD COLUMN page_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE visits ADD COLUMN engagement_started_at TEXT;
ALTER TABLE visits ADD COLUMN engagement_updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_pageviews_client_pageview
    ON pageviews(site_id, visit_id, client_pageview_id);

CREATE INDEX IF NOT EXISTS idx_visits_site_engagement
    ON visits(site_id, engagement_updated_at DESC);
