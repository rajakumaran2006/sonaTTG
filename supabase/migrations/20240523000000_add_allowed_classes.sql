-- Migration to add allowed_classes column to labs table
-- Run this in your Supabase SQL Editor

ALTER TABLE labs 
ADD COLUMN IF NOT EXISTS allowed_classes JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN labs.allowed_classes IS 'Array of {year, section} objects defining access control';
