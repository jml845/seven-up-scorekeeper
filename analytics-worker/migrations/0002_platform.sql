ALTER TABLE events ADD COLUMN platform TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE installations ADD COLUMN platform TEXT NOT NULL DEFAULT 'unknown';
