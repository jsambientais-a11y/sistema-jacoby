-- Boletins de medição emitidos antes do sistema (PDF original). Ficam apenas
-- no Portal do Cliente: não criam ciclos no faturamento nem ocupam numeração.
CREATE TABLE IF NOT EXISTS public.client_historical_bulletins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.client_branches(id) ON DELETE SET NULL,
  bulletin_number TEXT NOT NULL,
  description TEXT,
  issuer_name TEXT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  issued_on DATE,
  total_amount NUMERIC(14, 2),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS client_historical_bulletins_client_idx
  ON public.client_historical_bulletins (client_id, period_start DESC);

ALTER TABLE public.client_historical_bulletins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jacoby_historical_bulletins_admin_manage ON public.client_historical_bulletins;
CREATE POLICY jacoby_historical_bulletins_admin_manage ON public.client_historical_bulletins
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS jacoby_historical_bulletins_billing_manage ON public.client_historical_bulletins;
CREATE POLICY jacoby_historical_bulletins_billing_manage ON public.client_historical_bulletins
  FOR ALL TO authenticated
  USING (public.has_app_permission('billing'))
  WITH CHECK (public.has_app_permission('billing'));

DROP POLICY IF EXISTS jacoby_historical_bulletins_client_read ON public.client_historical_bulletins;
CREATE POLICY jacoby_historical_bulletins_client_read ON public.client_historical_bulletins
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_user_links AS link
    WHERE link.client_id = client_historical_bulletins.client_id
      AND link.user_id = auth.uid()
  ));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('historical-bulletins', 'historical-bulletins', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = 20971520, allowed_mime_types = ARRAY['application/pdf'];

DROP POLICY IF EXISTS jacoby_historical_bulletins_storage_manage ON storage.objects;
CREATE POLICY jacoby_historical_bulletins_storage_manage ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'historical-bulletins'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_app_permission('billing'))
  )
  WITH CHECK (
    bucket_id = 'historical-bulletins'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_app_permission('billing'))
  );

DROP POLICY IF EXISTS jacoby_historical_bulletins_storage_client_read ON storage.objects;
CREATE POLICY jacoby_historical_bulletins_storage_client_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'historical-bulletins'
    AND EXISTS (
      SELECT 1
      FROM public.client_historical_bulletins AS bulletin
      JOIN public.client_user_links AS link ON link.client_id = bulletin.client_id
      WHERE bulletin.storage_path = storage.objects.name
        AND link.user_id = auth.uid()
    )
  );

-- Coletas confirmadas dos boletins já publicados ao cliente (o boletim inteiro
-- ou a emissão daquele resíduo), para alimentar o gráfico do portal.
CREATE OR REPLACE FUNCTION public.jacoby_client_chart_bulletin_movements(p_client_id UUID)
RETURNS TABLE (
  id UUID,
  occurred_on DATE,
  weight_kg NUMERIC,
  waste_residue_id UUID,
  branch_id UUID,
  service_order TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT movement.id, movement.occurred_on, movement.weight_kg, movement.waste_residue_id,
    COALESCE(movement.branch_id, cycle.branch_id), movement.service_order
  FROM public.billing_v2_movements AS movement
  JOIN public.billing_v2_cycles AS cycle ON cycle.id = movement.cycle_id
  WHERE cycle.client_id = p_client_id
    AND NOT cycle.is_demo
    AND cycle.status = 'closed'
    AND movement.confirmed
    AND (
      cycle.client_portal_visible
      OR EXISTS (
        SELECT 1 FROM public.billing_v2_residue_emissions AS emission
        WHERE emission.cycle_id = cycle.id
          AND emission.client_portal_visible
          AND emission.waste_residue_id IS NOT DISTINCT FROM movement.waste_residue_id
      )
    )
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_app_permission('billing')
      OR EXISTS (
        SELECT 1 FROM public.client_user_links AS link
        WHERE link.client_id = p_client_id AND link.user_id = auth.uid()
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.jacoby_client_chart_bulletin_movements(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
