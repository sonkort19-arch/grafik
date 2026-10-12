-- Do not alter legacy closed shifts; reject each new close without an existing report.
CREATE OR REPLACE FUNCTION public.ma_require_report_before_shift_close()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.ma_shift_daily_reports AS r WHERE r.shift_id = NEW.id) THEN
      RAISE EXCEPTION 'Сначала заполните отчёт за день, затем закройте смену' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ma_require_report_before_shift_close ON public.ma_shifts;
CREATE TRIGGER ma_require_report_before_shift_close
BEFORE UPDATE OF closed_at ON public.ma_shifts
FOR EACH ROW EXECUTE FUNCTION public.ma_require_report_before_shift_close();
