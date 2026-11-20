/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** https://<ref>.supabase.co */
  readonly PUBLIC_SUPABASE_URL: string;
  /** Publishable key (sb_publishable_…). Só executa ficha_publica: o resto é barrado no banco. */
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
