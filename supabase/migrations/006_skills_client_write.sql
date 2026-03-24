-- Allow authenticated users to upsert skills (needed for ClawHub installs)
create policy "skills_authenticated_upsert" on public.skills
  for insert with check (auth.uid() is not null);

create policy "skills_authenticated_update" on public.skills
  for update using (auth.uid() is not null);
