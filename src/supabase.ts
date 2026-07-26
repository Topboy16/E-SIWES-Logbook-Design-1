import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[e-SIWES] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. ' +
    'Add them to your Render Environment Variables (Dashboard → Environment) ' +
    'or to a local .env file for development. The app will run in offline/mock mode.'
  )
}

// Validate URL format
if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
  console.error(
    '[e-SIWES] VITE_SUPABASE_URL must start with https://. Current value:', supabaseUrl
  )
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseKey ?? 'placeholder-anon-key'
)
