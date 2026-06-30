
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'places-images',
  'places-images',
  true,                                          
  5242880,                                      
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','image/svg+xml'];



DROP POLICY IF EXISTS "Public read access" ON storage.objects;
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'places-images' );


DROP POLICY IF EXISTS "Backend upload access" ON storage.objects;
CREATE POLICY "Backend upload access"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK ( bucket_id = 'places-images' );

DROP POLICY IF EXISTS "Backend delete access" ON storage.objects;
CREATE POLICY "Backend delete access"
ON storage.objects FOR DELETE
TO service_role
USING ( bucket_id = 'places-images' );

DROP POLICY IF EXISTS "Backend update access" ON storage.objects;
CREATE POLICY "Backend update access"
ON storage.objects FOR UPDATE
TO service_role
USING ( bucket_id = 'places-images' );


ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Roles por usuario usando la tabla profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';

UPDATE public.profiles
SET role = COALESCE(NULLIF(btrim(role), ''), 'user')
WHERE role IS NULL;

-- Permisos para que el backend pueda leer las tablas con el service role
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.places TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ads TO service_role;

-- Opción rápida: asignar admin directo en los metadatos de Auth (la app lo lee ya)
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
WHERE email = 'leandrope234@gmail.com';

-- Si prefieres usar la tabla profiles, este también sirve una vez que quedan los permisos correctos
-- UPDATE public.profiles SET role = 'admin' WHERE id = 'b2fb31cc-dfc0-490f-bccb-32ba0a78ea1a';


