-- Create the files table
create table if not exists public.files (
    id uuid default uuid_generate_v4() primary key,
    name text not null,
    path text not null,
    recipient_email text not null,
    expiry_date timestamp with time zone not null,
    created_at timestamp with time zone default now(),
    download_count integer default 0,
    user_id uuid references auth.users(id) not null
);

-- Set up RLS (Row Level Security) policies
alter table public.files enable row level security;

-- Create policy to allow users to insert their own files
create policy "Users can insert their own files"
    on public.files
    for insert
    with check (auth.uid() = user_id);

-- Create policy to allow users to view their own files
create policy "Users can view their own files"
    on public.files
    for select
    using (auth.uid() = user_id);

-- Create policy to allow users to update their own files
create policy "Users can update their own files"
    on public.files
    for update
    using (auth.uid() = user_id);

-- Create policy to allow users to delete their own files
create policy "Users can delete their own files"
    on public.files
    for delete
    using (auth.uid() = user_id); 