-- Add message column to files table
ALTER TABLE public.files
ADD COLUMN message text; 