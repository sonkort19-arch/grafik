-- Allows securely setting the Irma password without exposing credentials in SQL migrations or source code.
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
 ON CONFLICT(username) DO UPDATE SET employee_name=excluded.employee_name,role='marketer',
 password_hash=excluded.password_hash,active=true,failed_attempts=0,locked_until=NULL,updated_at=now();
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.ma_set_marketer_credentials(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ma_set_marketer_credentials(text,text,text) TO service_role;
