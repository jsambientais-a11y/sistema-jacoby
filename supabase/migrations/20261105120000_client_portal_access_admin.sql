-- Gestão do acesso ao Portal do Cliente pela tela de Clientes.
-- Não altera logins, vínculos nem políticas existentes: apenas acrescenta a
-- anotação interna de senha e funções exclusivas para administradores.

-- A anotação fica fora de public.clients de propósito: colaboradores e o próprio
-- cliente leem aquela tabela. Aqui não há grant nem policy para usuários comuns;
-- leitura e escrita acontecem somente pelas funções abaixo.
CREATE TABLE IF NOT EXISTS public.client_portal_password_notes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.client_portal_password_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_portal_password_notes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.client_portal_password_notes TO service_role;

CREATE OR REPLACE FUNCTION public.admin_list_client_portal_access(target_client_id uuid)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  access_enabled boolean,
  last_sign_in_at timestamptz,
  password_note text,
  password_note_updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $body$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Somente administradores podem consultar acessos do portal.';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    p.full_name,
    u.email::text,
    COALESCE(p.is_active, true) AND (u.banned_until IS NULL OR u.banned_until <= now()),
    u.last_sign_in_at,
    n.note,
    n.updated_at
  FROM public.client_user_links link
  JOIN auth.users u ON u.id = link.user_id
  JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'client'::public.app_role
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.client_portal_password_notes n ON n.user_id = u.id
  WHERE link.client_id = target_client_id
  ORDER BY p.full_name NULLS LAST, u.email;
END;
$body$;

-- Bloqueia o login de verdade. profiles.is_active sozinho é só um rótulo de tela:
-- quem barra a entrada é banned_until, e apagar as sessões impede renovar o token.
-- Usa uma data distante porque o Auth não lê o valor 'infinity'.
CREATE OR REPLACE FUNCTION public.admin_set_client_portal_access(target_user_id uuid, enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $body$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Somente administradores podem alterar acessos do portal.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = target_user_id AND role = 'client'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Este acesso não é um cliente vinculado ao portal.';
  END IF;

  UPDATE auth.users
     SET banned_until = CASE WHEN enabled THEN NULL ELSE now() + interval '100 years' END,
         updated_at = now()
   WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  UPDATE public.profiles
     SET is_active = enabled, updated_at = now()
   WHERE id = target_user_id;

  IF NOT enabled THEN
    DELETE FROM auth.sessions WHERE user_id = target_user_id;
  END IF;
END;
$body$;

CREATE OR REPLACE FUNCTION public.admin_set_client_portal_password_note(target_user_id uuid, new_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Somente administradores podem alterar anotações de senha.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = target_user_id AND role = 'client'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Este acesso não é um cliente vinculado ao portal.';
  END IF;

  IF new_note IS NULL OR btrim(new_note) = '' THEN
    DELETE FROM public.client_portal_password_notes WHERE user_id = target_user_id;
    RETURN;
  END IF;

  INSERT INTO public.client_portal_password_notes (user_id, note, updated_at, updated_by)
  VALUES (target_user_id, new_note, now(), auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET note = EXCLUDED.note, updated_at = now(), updated_by = auth.uid();
END;
$body$;

REVOKE ALL ON FUNCTION public.admin_list_client_portal_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_client_portal_access(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_client_portal_password_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_client_portal_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_client_portal_access(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_client_portal_password_note(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
