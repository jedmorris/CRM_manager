-- Automations table for storing user-created background automations
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS automations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Human-readable name and description
  name TEXT NOT NULL,
  description TEXT,

  -- Trigger configuration (e.g., "new email from X")
  trigger_type TEXT NOT NULL, -- 'gmail_email', 'gmail_label', 'schedule', etc.
  trigger_config JSONB NOT NULL DEFAULT '{}',
  -- Example trigger_config for gmail_email:
  -- { "from_filter": "john@example.com", "subject_contains": "invoice" }

  -- Action configuration (e.g., "create ClickUp task")
  action_type TEXT NOT NULL, -- 'clickup_create_task', 'clickup_add_comment', 'send_email', etc.
  action_config JSONB NOT NULL DEFAULT '{}',
  -- Example action_config for clickup_create_task:
  -- { "list_id": "123", "title_template": "{{email.subject}}", "description_template": "From: {{email.from}}" }

  -- Webhook info
  webhook_id TEXT UNIQUE, -- Unique identifier for the webhook URL
  webhook_secret TEXT, -- Secret for validating webhook calls

  -- Gmail watch info (for push notifications)
  gmail_history_id TEXT, -- Last processed history ID
  gmail_watch_expiration TIMESTAMPTZ, -- When the Gmail watch expires

  -- Status and metadata
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'error'
  last_run_at TIMESTAMPTZ,
  last_error TEXT,
  run_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by user
CREATE INDEX idx_automations_user_id ON automations(user_id);

-- Index for webhook lookups
CREATE INDEX idx_automations_webhook_id ON automations(webhook_id);

-- Index for finding automations that need Gmail watch renewal
CREATE INDEX idx_automations_gmail_watch ON automations(gmail_watch_expiration)
  WHERE trigger_type LIKE 'gmail_%' AND status = 'active';

-- Enable Row Level Security
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own automations
CREATE POLICY "Users can view own automations" ON automations
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own automations
CREATE POLICY "Users can create own automations" ON automations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own automations
CREATE POLICY "Users can update own automations" ON automations
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own automations
CREATE POLICY "Users can delete own automations" ON automations
  FOR DELETE USING (auth.uid() = user_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating updated_at
CREATE TRIGGER update_automations_updated_at
  BEFORE UPDATE ON automations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Automation execution logs for debugging and history
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,

  -- Execution details
  status TEXT NOT NULL, -- 'success', 'error', 'skipped'
  trigger_data JSONB, -- The data that triggered the automation
  action_result JSONB, -- Result of the action (e.g., created task ID)
  error_message TEXT,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- Index for fetching logs by automation
CREATE INDEX idx_automation_logs_automation_id ON automation_logs(automation_id);

-- Index for recent logs
CREATE INDEX idx_automation_logs_started_at ON automation_logs(started_at DESC);

-- RLS for logs
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- Users can view logs for their own automations
CREATE POLICY "Users can view own automation logs" ON automation_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM automations
      WHERE automations.id = automation_logs.automation_id
      AND automations.user_id = auth.uid()
    )
  );
