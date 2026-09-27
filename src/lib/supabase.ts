// Supabase client singleton for the GST Billing app.
//
// URL is public (it ships inside the app anyway). The anon key is placed by
// the parent agent at integration time — never commit a real key here.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://agnhibxktkzkoxtctjyr.supabase.co';

// >>> PARENT AGENT: replace this placeholder with the real anon (public) key.
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnbmhpYnhrdGt6a294dGN0anlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NTMyMDAsImV4cCI6MjEwNjAyOTIwMH0.m2ag86W8LhLVciusk5lNmXx5la0Lxey3zdQ43Xz5jgU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Native app: there is no URL to detect a session from.
    detectSessionInUrl: false,
  },
});
