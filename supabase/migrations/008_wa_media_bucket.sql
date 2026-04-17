-- Migration 008: Supabase Storage bucket pra mídia WhatsApp
-- Cria bucket público pra imagens/áudios/documentos enviados e recebidos via WhatsApp

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wa-media',
  'wa-media',
  true,
  16777216, -- 16MB
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp',
    'audio/ogg','audio/mpeg','audio/mp4','audio/wav','audio/webm','audio/x-m4a',
    'video/mp4','video/webm',
    'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies: leitura pública (pra URL funcionar no browser) + upload via service_role
DROP POLICY IF EXISTS "wa-media public read" ON storage.objects;
CREATE POLICY "wa-media public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'wa-media');

-- Service role bypassa RLS automaticamente; só precisamos desta pra usuários autenticados lerem/escreverem
DROP POLICY IF EXISTS "wa-media auth write" ON storage.objects;
CREATE POLICY "wa-media auth write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'wa-media' AND auth.uid() IS NOT NULL);
