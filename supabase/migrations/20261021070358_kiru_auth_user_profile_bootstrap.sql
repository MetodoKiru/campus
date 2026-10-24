-- Create a minimal profile when Supabase Auth creates an account.
-- Never trust the role supplied in user_metadata: new accounts are always alumno.
CREATE OR REPLACE FUNCTION public.handle_new_kiru_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text;
BEGIN
  v_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'Usuario Kiru'
  );

  INSERT INTO public.profiles (id, full_name, role, is_active)
  VALUES (NEW.id, v_name, 'alumno', true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.students (profile_id)
  VALUES (NEW.id)
  ON CONFLICT (profile_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_kiru_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_kiru ON auth.users;
CREATE TRIGGER on_auth_user_created_kiru
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_kiru_user();
