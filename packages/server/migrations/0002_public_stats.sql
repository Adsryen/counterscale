-- Per-site public analytics flag (1 = anonymous can view on /dashboard)
ALTER TABLE sites ADD COLUMN public_stats INTEGER NOT NULL DEFAULT 1;
