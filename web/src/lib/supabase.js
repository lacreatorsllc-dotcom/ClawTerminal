import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://davonrtdydhdgbwnpuxy.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhdm9ucnRkeWRoZGdid25wdXh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjI4NjgsImV4cCI6MjA4OTc5ODg2OH0.EakW4lWGWbvbBNesauOiQYzZUL1TM4zJQrxDTSa3-EE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function joinWaitlist(email) {
  const { error } = await supabase
    .from('waitlist')
    .insert({ email: email.trim().toLowerCase() })

  if (error) {
    if (error.code === '23505') return { ok: true } // already signed up — treat as success
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
