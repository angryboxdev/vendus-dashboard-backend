-- Tabela de utilizadores da aplicação com roles
CREATE TABLE public.app_users (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text        NOT NULL,
  role       text        NOT NULL CHECK (role IN ('admin', 'manager', 'hr_viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS activo; service role bypassa sempre (é o que o backend usa)
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- ---------- Custom Access Token Hook ----------
-- Injeta app_role nos claims JWT antes de ser emitido pelo Supabase Auth.
-- IMPORTANTE: após aplicar esta migration, activar o hook em
-- Supabase Dashboard → Authentication → Hooks → Custom Access Token Hook
-- apontando para public.custom_access_token_hook

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims   jsonb;
  app_role text;
BEGIN
  SELECT role INTO app_role
  FROM public.app_users
  WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';

  IF app_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_role}', to_jsonb(app_role));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Permissões para o Supabase Auth invocar o hook
GRANT USAGE  ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
GRANT ALL ON TABLE public.app_users TO supabase_auth_admin;
