-- Comissão de tratamento por cliente e por pátio.
-- Antes, quando o cliente tinha uma regra própria, o modelo padrão da terceirizada
-- deixava de valer para os demais resíduos (ex.: a sucata da Eliana passava de
-- R$ 0,10/kg para o cálculo automático). Agora a ordem é sempre:
--   1) exceção do cliente para aquele resíduo/pátio;
--   2) modelo padrão da terceirizada (pelo nome do resíduo);
--   3) automático: valor do cliente/kg − valor da terceirizada/kg.
CREATE OR REPLACE FUNCTION public.sync_outsourced_cycle_commissions(target_cycle_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cycle_row public.billing_v2_cycles%ROWTYPE;
  setting_row public.outsourced_commission_settings%ROWTYPE;
  template_row public.outsourced_commission_templates%ROWTYPE;
  setting_id UUID;
  template_id UUID;
  tax_rate NUMERIC;
  rental_rate NUMERIC;
  exchange_commission NUMERIC;
BEGIN
  SELECT * INTO cycle_row FROM public.billing_v2_cycles WHERE id = target_cycle_id;
  IF NOT FOUND OR cycle_row.status <> 'closed' OR cycle_row.issuer_type <> 'outsourced' OR cycle_row.outsourced_company_id IS NULL THEN
    DELETE FROM public.outsourced_movement_commissions WHERE cycle_id = target_cycle_id;
    RETURN;
  END IF;

  SELECT * INTO setting_row FROM public.outsourced_commission_settings
  WHERE client_id = cycle_row.client_id AND outsourced_company_id = cycle_row.outsourced_company_id AND active LIMIT 1;
  IF FOUND THEN
    setting_id := setting_row.id;
    -- O modelo da terceirizada continua como base para os resíduos sem exceção do cliente/pátio.
    SELECT id INTO template_id FROM public.outsourced_commission_templates
    WHERE outsourced_company_id = cycle_row.outsourced_company_id AND active LIMIT 1; tax_rate := setting_row.tax_withholding_rate;
    rental_rate := setting_row.rental_commission_rate; exchange_commission := setting_row.exchange_commission_rate;
  ELSE
    SELECT * INTO template_row FROM public.outsourced_commission_templates
    WHERE outsourced_company_id = cycle_row.outsourced_company_id AND active LIMIT 1;
    IF NOT FOUND THEN
      DELETE FROM public.outsourced_movement_commissions WHERE cycle_id = target_cycle_id;
      RETURN;
    END IF;
    setting_id := NULL; template_id := template_row.id; tax_rate := template_row.tax_withholding_rate;
    rental_rate := template_row.rental_commission_rate; exchange_commission := template_row.exchange_commission_rate;
  END IF;

  INSERT INTO public.outsourced_movement_commissions (
    cycle_id, client_id, outsourced_company_id, commission_setting_id, commission_template_id, source_type, source_id,
    waste_residue_id, execution_date, base_amount, commission_rate, gross_commission_amount, tax_withholding_rate, tax_withheld_amount, net_commission_amount
  )
  SELECT cycle_row.id, cycle_row.client_id, cycle_row.outsourced_company_id, setting_id, template_id, 'rental', placement.id,
    placement.waste_residue_id, placement.started_on, ROUND(placement.quantity * placement.monthly_rental_rate, 2), rental_rate,
    ROUND(placement.quantity * placement.monthly_rental_rate * (1 - tax_rate / 100) * rental_rate / 100, 2), tax_rate,
    ROUND(placement.quantity * placement.monthly_rental_rate * tax_rate / 100, 2),
    ROUND(placement.quantity * placement.monthly_rental_rate * (1 - tax_rate / 100) * rental_rate / 100, 2)
  FROM public.billing_v2_placements placement WHERE placement.cycle_id = cycle_row.id
  ON CONFLICT (cycle_id, source_type, source_id) DO UPDATE SET
    commission_setting_id = EXCLUDED.commission_setting_id, commission_template_id = EXCLUDED.commission_template_id,
    waste_residue_id = EXCLUDED.waste_residue_id, execution_date = EXCLUDED.execution_date, base_amount = EXCLUDED.base_amount,
    commission_rate = EXCLUDED.commission_rate, gross_commission_amount = EXCLUDED.gross_commission_amount,
    tax_withholding_rate = EXCLUDED.tax_withholding_rate, tax_withheld_amount = EXCLUDED.tax_withheld_amount,
    net_commission_amount = EXCLUDED.net_commission_amount, updated_at = now();

  INSERT INTO public.outsourced_movement_commissions (
    cycle_id, client_id, outsourced_company_id, commission_setting_id, commission_template_id, source_type, source_id,
    waste_residue_id, execution_date, base_amount, commission_rate, gross_commission_amount, tax_withholding_rate, tax_withheld_amount, net_commission_amount
  )
  SELECT cycle_row.id, cycle_row.client_id, cycle_row.outsourced_company_id, setting_id, template_id, 'exchange', movement.id,
    movement.waste_residue_id, movement.occurred_on, ROUND(movement.removed_quantity * movement.exchange_rate, 2), exchange_commission,
    ROUND(movement.removed_quantity * movement.exchange_rate * (1 - tax_rate / 100) * exchange_commission / 100, 2), tax_rate,
    ROUND(movement.removed_quantity * movement.exchange_rate * tax_rate / 100, 2),
    ROUND(movement.removed_quantity * movement.exchange_rate * (1 - tax_rate / 100) * exchange_commission / 100, 2)
  FROM public.billing_v2_movements movement WHERE movement.cycle_id = cycle_row.id AND movement.confirmed AND movement.removed_quantity > 0
  ON CONFLICT (cycle_id, source_type, source_id) DO UPDATE SET
    commission_setting_id = EXCLUDED.commission_setting_id, commission_template_id = EXCLUDED.commission_template_id,
    waste_residue_id = EXCLUDED.waste_residue_id, execution_date = EXCLUDED.execution_date, base_amount = EXCLUDED.base_amount,
    commission_rate = EXCLUDED.commission_rate, gross_commission_amount = EXCLUDED.gross_commission_amount,
    tax_withholding_rate = EXCLUDED.tax_withholding_rate, tax_withheld_amount = EXCLUDED.tax_withheld_amount,
    net_commission_amount = EXCLUDED.net_commission_amount, updated_at = now();

  INSERT INTO public.outsourced_movement_commissions (
    cycle_id, client_id, outsourced_company_id, commission_setting_id, commission_template_id, source_type, source_id,
    waste_residue_id, execution_date, base_amount, commission_rate, gross_commission_amount, tax_withholding_rate, tax_withheld_amount, net_commission_amount
  )
  SELECT cycle_row.id, cycle_row.client_id, cycle_row.outsourced_company_id, setting_id, template_id, 'treatment', movement.id,
    movement.waste_residue_id, movement.occurred_on, ROUND(movement.weight_kg * movement.treatment_rate, 2),
    COALESCE(client_rate.jacoby_treatment_rate, template_rate.jacoby_treatment_rate, GREATEST(movement.treatment_rate - COALESCE(client_rate.outsourced_treatment_rate, template_rate.outsourced_treatment_rate), 0)),
    ROUND(movement.weight_kg * COALESCE(client_rate.jacoby_treatment_rate, template_rate.jacoby_treatment_rate, GREATEST(movement.treatment_rate - COALESCE(client_rate.outsourced_treatment_rate, template_rate.outsourced_treatment_rate), 0)), 2),
    tax_rate,
    ROUND(movement.weight_kg * COALESCE(client_rate.jacoby_treatment_rate, template_rate.jacoby_treatment_rate, GREATEST(movement.treatment_rate - COALESCE(client_rate.outsourced_treatment_rate, template_rate.outsourced_treatment_rate), 0)) * tax_rate / 100, 2),
    ROUND(movement.weight_kg * COALESCE(client_rate.jacoby_treatment_rate, template_rate.jacoby_treatment_rate, GREATEST(movement.treatment_rate - COALESCE(client_rate.outsourced_treatment_rate, template_rate.outsourced_treatment_rate), 0)) * (1 - tax_rate / 100), 2)
  FROM public.billing_v2_movements movement
  JOIN public.waste_residues residue ON residue.id = movement.waste_residue_id
  LEFT JOIN public.outsourced_treatment_commission_rates client_rate ON client_rate.commission_setting_id = setting_id AND client_rate.waste_residue_id = movement.waste_residue_id
  LEFT JOIN public.outsourced_treatment_commission_template_rates template_rate ON template_rate.commission_template_id = template_id AND lower(template_rate.residue_name) = lower(residue.name)
  WHERE movement.cycle_id = cycle_row.id AND movement.confirmed AND movement.weight_kg > 0
    AND (client_rate.id IS NOT NULL OR template_rate.id IS NOT NULL)
  ON CONFLICT (cycle_id, source_type, source_id) DO UPDATE SET
    commission_setting_id = EXCLUDED.commission_setting_id, commission_template_id = EXCLUDED.commission_template_id,
    waste_residue_id = EXCLUDED.waste_residue_id, execution_date = EXCLUDED.execution_date, base_amount = EXCLUDED.base_amount,
    commission_rate = EXCLUDED.commission_rate, gross_commission_amount = EXCLUDED.gross_commission_amount,
    tax_withholding_rate = EXCLUDED.tax_withholding_rate, tax_withheld_amount = EXCLUDED.tax_withheld_amount,
    net_commission_amount = EXCLUDED.net_commission_amount, updated_at = now();

  DELETE FROM public.outsourced_movement_commissions entry
  WHERE entry.cycle_id = cycle_row.id AND NOT EXISTS (
    SELECT 1 FROM public.billing_v2_placements placement WHERE entry.source_type = 'rental' AND placement.id = entry.source_id
    UNION ALL
    SELECT 1 FROM public.billing_v2_movements movement WHERE entry.source_type = 'exchange' AND movement.id = entry.source_id AND movement.confirmed
    UNION ALL
    SELECT 1 FROM public.billing_v2_movements movement
    JOIN public.waste_residues residue ON residue.id = movement.waste_residue_id
    LEFT JOIN public.outsourced_treatment_commission_rates client_rate ON client_rate.commission_setting_id = setting_id AND client_rate.waste_residue_id = movement.waste_residue_id
    LEFT JOIN public.outsourced_treatment_commission_template_rates template_rate ON template_rate.commission_template_id = template_id AND lower(template_rate.residue_name) = lower(residue.name)
    WHERE entry.source_type = 'treatment' AND movement.id = entry.source_id AND movement.confirmed
      AND (client_rate.id IS NOT NULL OR template_rate.id IS NOT NULL)
  );
END;
$function$;

-- Recalcula os BMs finalizados de terceirizadas para aplicar a regra corrigida.
DO $$
DECLARE
  target UUID;
BEGIN
  FOR target IN SELECT id FROM public.billing_v2_cycles WHERE status = 'closed' AND issuer_type = 'outsourced' LOOP
    PERFORM public.sync_outsourced_cycle_commissions(target);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
