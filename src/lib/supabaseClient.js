const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
} else if (SUPABASE_URL && !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '[WARN] SUPABASE_URL configurado pero falta SUPABASE_SERVICE_ROLE_KEY. ' +
      'Se desactiva Supabase remoto (modo degradado local).'
  );
}

function isSupabaseEnabled() {
  return Boolean(supabase);
}

module.exports = {
  supabase,
  isSupabaseEnabled
};
