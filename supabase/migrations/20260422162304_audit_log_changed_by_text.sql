-- Change audit_log.changed_by from uuid to text so we can store names or 'auth:<uuid>' fallback
-- Convert existing uuid values to their text representation
ALTER TABLE audit_log ALTER COLUMN changed_by TYPE text USING changed_by::text;
