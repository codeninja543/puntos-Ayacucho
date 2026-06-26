
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


