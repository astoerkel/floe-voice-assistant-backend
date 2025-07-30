-- Add OAuth columns to existing users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_user_info JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS airtable_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS airtable_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS airtable_user_info JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS device_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id);
CREATE INDEX IF NOT EXISTS idx_users_google_tokens ON users(google_access_token) WHERE google_access_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_airtable_tokens ON users(airtable_access_token) WHERE airtable_access_token IS NOT NULL;