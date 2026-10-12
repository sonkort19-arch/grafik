-- Marketer access is entirely separate from Supabase owner/admin sessions.
CREATE TABLE IF NOT EXISTS public.ma_marketer_accounts (
  username text PRIMARY KEY CHECK (username ~ '^[a-z0-9_]{3,40}$'),
  employee_name text NOT NULL CHECK (length(btrim(employee_name)) BETWEEN 2 AND 80),
  role text NOT NULL DEFAULT 'marketer' CHECK (role = 'marketer'),
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ma_marketer_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ma_marketer_accounts FROM anon, authenticated, PUBLIC;
CREATE OR REPLACE FUNCTION public.ma_verify_marketer_login(p_username text,p_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE account public.ma_marketer_accounts%ROWTYPE;
  attempts integer;
BEGIN
  SELECT * INTO account FROM public.ma_marketer_accounts
  WHERE username=lower(btrim(p_username)) AND active=true FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  IF account.locked_until IS NOT NULL AND account.locked_until>now() THEN
    RETURN jsonb_build_object('ok',false,'locked',true);
  END IF;
  IF extensions.crypt(p_password,account.password_hash)=account.password_hash THEN
    UPDATE public.ma_marketer_accounts SET failed_attempts=0,locked_until=NULL,updated_at=now() WHERE username=account.username;
    RETURN jsonb_build_object('ok',true,'username',account.username,'employee',account.employee_name,'role',account.role);
  END IF;
  attempts=account.failed_attempts+1;
  UPDATE public.ma_marketer_accounts
    SET failed_attempts=CASE WHEN attempts>=5 THEN 0 ELSE attempts END,
        locked_until=CASE WHEN attempts>=5 THEN now()+interval '30 minutes' ELSE NULL END,
        updated_at=now() WHERE username=account.username;
  RETURN jsonb_build_object('ok',false,'locked',attempts>=5);
END;
$$;
REVOKE ALL ON FUNCTION public.ma_verify_marketer_login(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ma_verify_marketer_login(text,text) TO service_role;
-- Credentials are provisioned separately and never committed to GitHub.
