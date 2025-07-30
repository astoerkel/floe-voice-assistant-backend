-- Add missing Google service columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS google_services_connected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS google_scope_granted TEXT;

-- Add comment for clarity
COMMENT ON COLUMN users.google_services_connected IS 'Indicates if Google services (Gmail, Calendar) are connected';
COMMENT ON COLUMN users.google_scope_granted IS 'Space-separated list of granted Google OAuth scopes';