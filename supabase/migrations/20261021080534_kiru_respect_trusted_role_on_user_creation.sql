CREATE OR REPLACE FUNCTION public.handle_new_kiru_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_name text;
  v_role text;
BEGIN
  v_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'Usuario Kiru'
  );

  -- Only app_metadata is trusted for privileged roles; user_metadata is user-editable.
  v_role := CASE
    WHEN NEW.raw_app_meta_data ->> 'kiru_role' IN ('admin', 'mentor', 'padre', 'alumno')
      THEN NEW.raw_app_meta_data ->> 'kiru_role'
    ELSE 'alumno'
  END;

  INSERT INTO public.profiles (id, full_name, role, is_active)
  VALUES (NEW.id, v_name, v_role, true)
  ON CONFLICT (id) DO NOTHING;

  IF v_role = 'alumno' THEN
    INSERT INTO public.students (profile_id)
    VALUES (NEW.id)
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
