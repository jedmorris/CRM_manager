-- Add ClickUp webhook ID column to automations table
-- Run this in Supabase SQL Editor after 001_create_automations_table.sql

-- Add column for storing ClickUp's webhook ID
ALTER TABLE automations
ADD COLUMN IF NOT EXISTS clickup_webhook_id TEXT;

-- Add index for ClickUp webhook lookups
CREATE INDEX IF NOT EXISTS idx_automations_clickup_webhook_id
ON automations(clickup_webhook_id)
WHERE clickup_webhook_id IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN automations.clickup_webhook_id IS
'ClickUp webhook ID returned when registering a webhook. Used for updating/deleting the webhook.';
