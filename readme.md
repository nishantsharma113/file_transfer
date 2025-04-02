# File Transfer Application

A secure file transfer application built with React and Supabase that allows users to:
- Upload files and send messages
- Share files via secure links
- Set expiry dates for shared files
- Track file downloads
- Send notifications via email

## Features

- **File Upload**: Drag & drop or click to upload files
- **Message Support**: Send messages with or without files
- **Preview Support**: Preview images and text files before sending
- **Secure Sharing**: Generate secure, expiring links
- **Email Notifications**: Automatic email notifications to recipients
- **Download Tracking**: Track number of downloads
- **Expiry Control**: Set custom expiry dates for shared files

## Tech Stack

- React
- TypeScript
- Supabase (Backend & Storage)
- TailwindCSS (Styling)

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/nishantsharma113/file_transfer.git
   cd file_transfer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and add your Supabase credentials:
   ```env
   REACT_APP_SUPABASE_URL=your_supabase_url
   REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Run the development server:
   ```bash
   npm start
   ```

5. Build for production:
   ```bash
   npm run build
   ```

## Database Setup

The application requires the following Supabase table structure:

```sql
CREATE TABLE public.files (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    name text NOT NULL,
    path text,
    recipient_email text NOT NULL,
    expiry_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid REFERENCES auth.users(id),
    download_count integer DEFAULT 0,
    message text,
    type text NOT NULL DEFAULT 'file_and_message'
    CHECK (type IN ('file_and_message', 'message_only'))
);

-- Add RLS policies for security
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
```

## Contributing

Feel free to submit issues and enhancement requests.

## Contact

Nishant Sharma - nishantsharma11398@gmail.com

## License

This project is licensed under the MIT License.