-- ============================================
-- FIX: Change thread_id from UUID to TEXT
-- Gmail thread IDs are hex strings (e.g., "19b1c4a2c9741535"), not UUIDs
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Check current column type
SELECT
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_name = 'emails'
  AND column_name = 'thread_id';

-- Step 2: Alter column type from UUID to TEXT
-- This allows storing Gmail's hex thread IDs
ALTER TABLE emails
ALTER COLUMN thread_id TYPE TEXT;

-- Step 3: Verify the change
SELECT
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_name = 'emails'
  AND column_name = 'thread_id';

-- Success message
SELECT 'thread_id column changed to TEXT successfully!' as status;
