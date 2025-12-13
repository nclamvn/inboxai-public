-- Add new user to whitelist
-- Run this in Supabase SQL Editor

INSERT INTO whitelist (email, notes, is_active)
VALUES ('nhatminh.phan@gmail.com', 'Added by admin - Nhat Minh Phan', true)
ON CONFLICT (email) DO UPDATE SET is_active = true;

-- Verify
SELECT * FROM whitelist WHERE email = 'nhatminh.phan@gmail.com';
