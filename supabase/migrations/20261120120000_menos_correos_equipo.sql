-- Menos correos para mentores y coordinadores (20/11/2026).
--
-- 1. Confirmar disponibilidad antes de la renovación: como mucho 3 avisos por
--    alumno y renovación (primer aviso, un recordatorio a 9 días del fin si el
--    primero salió antes del día 10, y un único «URGENTE»). Antes eran avisos a
--    12, 11 y 9 días y un «URGENTE» cada día del 7 al 4.
-- 2. Ajuste «avisos_resumen»: los avisos no urgentes de mentores y coordinadores
--    se juntan en un solo correo al día (19:00). Lo aplica /api/avisos/clases;
--    la campanita no cambia. Con "activo": false todo vuelve a salir al momento.

CREATE OR REPLACE FUNCTION kiru_private.availability_checks_daily(p_today date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  r record;
  v_sent int := 0;
  v_missed int := 0;
  v_left int;
  v_name text;
  v_first_late boolean;
BEGIN
  FOR r IN
    SELECT c.*, split_part(coalesce(ps.full_name, ''), ' ', 1) AS student_name, pm.full_name AS mentor_name
    FROM public.kiru_availability_checks c
    JOIN public.profiles ps ON ps.id = c.student_id
    JOIN public.profiles pm ON pm.id = c.mentor_id
    WHERE c.confirmed_at IS NULL AND c.family_released_at IS NULL AND c.period_end >= p_today
  LOOP
    v_left := r.period_end - p_today;
    v_name := coalesce(nullif(r.student_name, ''), 'tu alumno');
    IF v_left >= 8 THEN
      -- ¿El primer aviso salió ya muy cerca (a 10 o 9 días)? Entonces no hay recordatorio.
      v_first_late := EXISTS (
        SELECT 1 FROM public.kiru_notifications n
        WHERE n.recipient_id = r.mentor_id
          AND n.event_key IN ('dispcheck:' || r.id || ':10', 'dispcheck:' || r.id || ':9'));
      IF r.reminders = 0 OR (r.reminders = 1 AND v_left <= 9 AND NOT v_first_late) THEN
        INSERT INTO public.kiru_notifications (recipient_id, student_id, kind, title, body, event_key, email_status)
        VALUES (r.mentor_id, r.student_id, 'disponibilidad_confirmar',
          CASE WHEN r.reminders = 0 THEN 'Confirma tu disponibilidad antes de la renovación de ' || v_name
               ELSE 'Recordatorio: confirma tu disponibilidad (renovación de ' || v_name || ')' END,
          'El ' || to_char(r.period_end - 7, 'DD/MM') || ' su familia recibirá la renovación y podrá elegir subir o bajar días. '
            || 'Antes del ' || to_char(r.period_end - 8, 'DD/MM') || ', entra en tu panel y confirma que tu disponibilidad sigue igual o actualízala. '
            || 'Si no la confirmas, la renovación se retrasa.',
          'dispcheck:' || r.id || ':' || v_left, 'pendiente')
        ON CONFLICT (recipient_id, event_key) DO NOTHING;
        IF FOUND THEN
          UPDATE public.kiru_availability_checks SET reminders = reminders + 1 WHERE id = r.id;
          v_sent := v_sent + 1;
        END IF;
      END IF;
    ELSE
      IF r.missed_at IS NULL THEN
        UPDATE public.kiru_availability_checks SET missed_at = now() WHERE id = r.id;
        v_missed := v_missed + 1;
        INSERT INTO public.kiru_notifications (recipient_id, student_id, kind, title, body, event_key, email_status)
        SELECT p.id, r.student_id, 'disponibilidad_falta',
          r.mentor_name || ' no ha confirmado su disponibilidad',
          'La renovación de ' || v_name || ' (fin ' || to_char(r.period_end, 'DD/MM') || ') está aplazada hasta que confirme. '
            || 'Queda anotada una falta. Si el ' || to_char(r.period_end - 4, 'DD/MM') || ' sigue sin confirmar, la familia recibirá la renovación sin la opción de subir.',
          'dispfalta:' || r.id, 'pendiente'
        FROM public.profiles p WHERE p.role = 'admin' AND p.is_active
        ON CONFLICT (recipient_id, event_key) DO NOTHING;
      END IF;
      -- Un solo «URGENTE» por renovación (antes, uno cada día).
      INSERT INTO public.kiru_notifications (recipient_id, student_id, kind, title, body, event_key, email_status)
      VALUES (r.mentor_id, r.student_id, 'disponibilidad_urgente',
        'URGENTE: confirma hoy tu disponibilidad (renovación de ' || v_name || ')',
        'La renovación de ' || v_name || ' está parada porque no has confirmado tu disponibilidad, y queda anotado como falta. '
          || 'Entra ahora en tu panel y pulsa «Mi disponibilidad sigue igual» o actualízala.',
        'dispcheck:' || r.id || ':urgente', 'pendiente')
      ON CONFLICT (recipient_id, event_key) DO NOTHING;
      IF FOUND THEN v_sent := v_sent + 1; END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('avisos', v_sent, 'faltas', v_missed);
END
$function$;

REVOKE ALL ON FUNCTION kiru_private.availability_checks_daily(date) FROM PUBLIC;

-- Resumen diario del equipo. Se puede cambiar sin tocar código:
--   hora: a partir de qué hora (Madrid) sale el resumen del día.
--   roles: quién recibe resumen en vez de un correo por aviso.
--   inmediatos: avisos que siguen saliendo al momento.
INSERT INTO public.kiru_settings (key, value) VALUES ('avisos_resumen', jsonb_build_object(
  'activo', true,
  'hora', 19,
  'roles', jsonb_build_array('mentor', 'coordinador'),
  'inmediatos', jsonb_build_array('clase_solicitud', 'clase_decision', 'clase_mas_info',
    'recuperacion_confirmada', 'disponibilidad_urgente', 'registro_error')))
ON CONFLICT (key) DO NOTHING;

-- Para encontrar rápido los avisos que esperan al resumen.
CREATE INDEX IF NOT EXISTS kiru_notifications_sent_idx ON public.kiru_notifications (recipient_id, email_sent_at)
  WHERE email_sent_at IS NOT NULL;
