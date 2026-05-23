import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vipxcinwnkveglqwzaew.supabase.co';
const supabaseKey = 'sb_publishable_RBq6vrWVG-Vb2FyC63YO4w_wlOlN-aj';

export const supabase = createClient(supabaseUrl, supabaseKey);