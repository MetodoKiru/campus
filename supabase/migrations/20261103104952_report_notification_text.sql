-- El aviso del Campus muestra un texto claro. El identificador del informe
-- queda en event_key para que el Apps Script prepare el enlace del correo.
CREATE OR REPLACE FUNCTION kiru_private.notify_family_progress_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'publicado' AND (TG_OP = 'INSERT' OR OLD.status <> 'publicado') THEN
    INSERT INTO public.kiru_notifications (recipient_id, student_id, kind, title, body, event_key, email_status)
    SELECT sg.guardian_id, NEW.student_id, 'informe_progreso',
           'Informe de progreso disponible',
           'Ya puedes consultar el informe en la pestaña «Informes» de tu panel familiar.',
           'informe_progreso:' || NEW.id::text,
           'pendiente'
    FROM public.student_guardians sg
    JOIN public.profiles guardian ON guardian.id = sg.guardian_id AND guardian.is_active AND guardian.role = 'padre'
    WHERE sg.student_id = NEW.student_id
    ON CONFLICT (recipient_id, event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION kiru_private.notify_family_progress_report() FROM PUBLIC, anon, authenticated;
