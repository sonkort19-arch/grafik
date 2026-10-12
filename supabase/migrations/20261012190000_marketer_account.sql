CREATE TABLE IF NOT EXISTS public.ma_marketer_accounts (
 username text PRIMARY KEY CHECK(username ~ '^[a-z0-9_]{3,40}$'),
 employee_name text NOT NULL CHECK(length(btrim(employee_name)) BETWEEN 2 AND 80),
 role text NOT NULL DEFAULT 'marketer' CHECK(role='marketer'),
 password_hash text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 failed_attempts integer NOT NULL DEFAULT 0,
 locked_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ma_marketer_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ma_marketer_accounts FROM anon,authenticated,PUBLIC;
CREATE TABLE IF NOT EXISTS public.ma_marketer_sessions (
 token_hash text PRIMARY KEY CHECK(char_length(token_hash)=64),
 username text NOT NULL REFERENCES public.ma_marketer_accounts(username) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS ma_marketer_sessions_username_idx ON public.ma_marketer_sessions(username,expires_at);
ALTER TABLE public.ma_marketer_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ma_marketer_sessions FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.ma_verify_marketer_login(p_username text,p_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE account public.ma_marketer_accounts%ROWTYPE; attempts integer;
BEGIN
 SELECT * INTO account FROM public.ma_marketer_accounts WHERE username=lower(btrim(p_username)) AND active=true FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
 IF account.locked_until IS NOT NULL AND account.locked_until>now() THEN RETURN jsonb_build_object('ok',false,'locked',true); END IF;
 IF extensions.crypt(p_password,account.password_hash)=account.password_hash THEN
 UPDATE public.ma_marketer_accounts SET failed_attempts=0,locked_until=NULL,updated_at=now() WHERE username=account.username;
 RETURN jsonb_build_object('ok',true,'username',account.username,'employee',account.employee_name,'role',account.role);
 END IF;
 attempts=account.failed_attempts+1;
 UPDATE public.ma_marketer_accounts SET failed_attempts=CASE WHEN attempts>=5 THEN 0 ELSE attempts END,
 locked_until=CASE WHEN attempts>=5 THEN now()+interval '30 minutes' ELSE NULL END,updated_at=now()
 WHERE username=account.username;
 RETURN jsonb_build_object('ok',false,'locked',attempts>=5);
END; $$;
REVOKE ALL ON FUNCTION public.ma_verify_marketer_login(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ma_verify_marketer_login(text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.ma_set_marketer_credentials(p_username text,p_employee_name text,p_password text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF lower(btrim(p_username)) !~ '^[a-z0-9_]{3,40}$' OR length(p_password)<4
 OR length(p_password)>128 OR length(btrim(p_employee_name))<2 THEN
  RAISE EXCEPTION 'Некорректные параметры учётной записи';
 END IF;
 INSERT INTO public.ma_marketer_accounts(username,employee_name,role,password_hash,active)
 VALUES(lower(btrim(p_username)),btrim(p_employee_name),'marketer',extensions.crypt(p_password,extensions.gen_salt('bf',12)),true)
 ON CONFLICT(username) DO UPDATE SET employee_name=excluded.employee_name,role='marketer',password_hash=excluded.password_hash,
 active=true,failed_attempts=0,locked_until=NULL,updated_at=now();
 DELETE FROM public.ma_marketer_sessions WHERE username=lower(btrim(p_username));
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.ma_set_marketer_credentials(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ma_set_marketer_credentials(text,text,text) TO service_role;
