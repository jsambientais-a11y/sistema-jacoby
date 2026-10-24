-- O PDF do boletim no Portal do Cliente mostra a terceirizada que emite a nota
-- (logo, razão social e dados cadastrais). O cliente só enxerga as empresas
-- vinculadas aos boletins já publicados para ele.
DROP POLICY IF EXISTS jacoby_client_read_bulletin_outsourced_companies ON public.outsourced_companies;
CREATE POLICY jacoby_client_read_bulletin_outsourced_companies ON public.outsourced_companies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.billing_v2_cycles cycle
      JOIN public.client_user_links link ON link.client_id = cycle.client_id
      WHERE link.user_id = auth.uid()
        AND cycle.status = 'closed'
        AND cycle.client_portal_visible
        AND (
          cycle.outsourced_company_id = outsourced_companies.id
          OR EXISTS (
            SELECT 1
            FROM public.billing_v2_cycle_services service
            WHERE service.cycle_id = cycle.id
              AND service.outsourced_company_id = outsourced_companies.id
          )
        )
    )
  );

NOTIFY pgrst, 'reload schema';
