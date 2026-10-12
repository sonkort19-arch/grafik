-- The shift table allows public reads for today's status, so reports are private.
CREATE TABLE IF NOT EXISTS public.ma_shift_daily_reports (
  shift_id bigint PRIMARY KEY REFERENCES public.ma_shifts(id) ON DELETE RESTRICT,
  total_appeals integer NOT NULL CHECK (total_appeals BETWEEN 0 AND 9999),
  reasons jsonb NOT NULL CHECK (jsonb_typeof(reasons) = 'array'),
  reported_by text NOT NULL CHECK (char_length(btrim(reported_by)) > 0),
  submitted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ma_shift_daily_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ma_shift_daily_reports FROM anon;
GRANT SELECT ON public.ma_shift_daily_reports TO authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ma_shift_daily_reports' AND policyname='ma_shift_reports_owner_read') THEN
    CREATE POLICY ma_shift_reports_owner_read ON public.ma_shift_daily_reports
      FOR SELECT TO authenticated USING ((SELECT auth.jwt() ->> 'email') = 'bul782@mail.ru');
  END IF;
END; $$;
