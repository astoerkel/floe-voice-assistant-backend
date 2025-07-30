-- Fix apple_id constraint to allow Google OAuth users
-- This allows users to be created via Google OAuth without Apple ID

-- Drop the NOT NULL constraint on apple_id
ALTER TABLE users ALTER COLUMN apple_id DROP NOT NULL;

-- Add a constraint to ensure that users have either apple_id OR email
ALTER TABLE users ADD CONSTRAINT users_must_have_identifier 
  CHECK (apple_id IS NOT NULL OR email IS NOT NULL);

-- Update the unique constraint to handle NULLs properly
-- (PostgreSQL already handles this correctly - UNIQUE allows multiple NULLs)

-- Add index on email for Google OAuth users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

COMMENT ON CONSTRAINT users_must_have_identifier ON users IS 
  'Ensure users have either Apple ID (Apple Sign In) or email (Google OAuth)';

-- Show updated table structure
\d users;