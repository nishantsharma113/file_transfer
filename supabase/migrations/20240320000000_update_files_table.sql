-- Make path column nullable to support message-only entries
ALTER TABLE public.files
ALTER COLUMN path DROP NOT NULL;

-- Add type column to distinguish between file+message and message-only entries
ALTER TABLE public.files
ADD COLUMN type text NOT NULL DEFAULT 'file_and_message'
CHECK (type IN ('file_and_message', 'message_only'));

-- Update existing records
UPDATE public.files
SET type = CASE 
    WHEN path IS NULL THEN 'message_only'
    ELSE 'file_and_message'
END;

-- Make name column more appropriate for both types
ALTER TABLE public.files
ALTER COLUMN name SET DEFAULT 'Message Only';

-- Add validation to ensure either path or message is present
ALTER TABLE public.files
ADD CONSTRAINT files_content_check 
CHECK (
    (path IS NOT NULL) OR 
    (message IS NOT NULL AND message != '')
); 