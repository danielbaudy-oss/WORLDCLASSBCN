const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ruytavhodexoxkejrgyb.supabase.co',
  // Use service role key for admin operations (bypasses RLS)
  // Get this from Supabase Dashboard > Settings > API > service_role key
  process.env.SUPABASE_SERVICE_KEY
);

// All punch data from the spreadsheet
const punches = [
