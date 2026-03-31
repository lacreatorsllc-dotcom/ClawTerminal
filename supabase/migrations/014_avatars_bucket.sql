-- Create public avatars storage bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload their own avatar
create policy "Users can upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name = (auth.uid()::text || '.' || split_part(name, '.', 2))
  );

-- Allow authenticated users to update their own avatar
create policy "Users can update own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());

-- Allow public read
create policy "Public avatar read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');
