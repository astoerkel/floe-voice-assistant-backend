-- OAuth State Management Table
CREATE TABLE IF NOT EXISTS oauth_states (
    id SERIAL PRIMARY KEY,
    state VARCHAR(255) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id),
    device_id VARCHAR(255),
    return_url TEXT,
    provider VARCHAR(50) DEFAULT 'google',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add OAuth-related columns to users table (if they don't exist)
DO $$ 
BEGIN 
    -- Google OAuth columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'google_access_token') THEN
        ALTER TABLE users ADD COLUMN google_access_token TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'google_refresh_token') THEN
        ALTER TABLE users ADD COLUMN google_refresh_token TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'google_user_info') THEN
        ALTER TABLE users ADD COLUMN google_user_info JSONB;
    END IF;
    
    -- Airtable OAuth columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'airtable_access_token') THEN
        ALTER TABLE users ADD COLUMN airtable_access_token TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'airtable_refresh_token') THEN
        ALTER TABLE users ADD COLUMN airtable_refresh_token TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'airtable_user_info') THEN
        ALTER TABLE users ADD COLUMN airtable_user_info JSONB;
    END IF;
    
    -- Device ID column for public OAuth flows
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'device_id') THEN
        ALTER TABLE users ADD COLUMN device_id VARCHAR(255);
    END IF;
    
    -- Timestamps for users table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'created_at') THEN
        ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'updated_at') THEN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_states_user_id ON oauth_states(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_states_device_id ON oauth_states(device_id);

CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id);
CREATE INDEX IF NOT EXISTS idx_users_google_tokens ON users(google_access_token) WHERE google_access_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_airtable_tokens ON users(airtable_access_token) WHERE airtable_access_token IS NOT NULL;

-- Clean up expired OAuth states (run periodically)
-- DELETE FROM oauth_states WHERE expires_at < NOW() - INTERVAL '1 hour';

COMMENT ON TABLE oauth_states IS 'Stores temporary OAuth state for security during authentication flows';
COMMENT ON TABLE users IS 'User accounts with integrated OAuth tokens for external services';