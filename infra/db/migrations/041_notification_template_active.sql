-- Migration 041: Notification template activate/deactivate
ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
