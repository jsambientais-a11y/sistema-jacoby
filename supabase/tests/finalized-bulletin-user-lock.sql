BEGIN;
-- Temporarily enable the setting for the confirmed Angela account; rollback
-- restores the original permissions and every tested data change.
UPDATE public.user_permissions SET permissions=array_append(permissions,'billing_lock_finalized') WHERE user_id='688b03c1-d49c-46eb-b0a3-9aaf84c3f69e' AND NOT ('billing_lock_finalized'=ANY(permissions));
SELECT set_config('request.jwt.claim.sub','688b03c1-d49c-46eb-b0a3-9aaf84c3f69e',true);
SET LOCAL ROLE authenticated;
DO $$DECLARE closed_id uuid;draft_id uuid; movement_id uuid;service_id uuid; rows_count integer; BEGIN
 IF NOT public.has_app_permission('billing') OR NOT public.has_app_permission('tasks') OR NOT public.has_app_permission('clients') THEN RAISE EXCEPTION 'Existing areas were lost';END IF;
 SELECT id INTO closed_id FROM public.billing_v2_cycles WHERE status='closed' AND NOT is_demo LIMIT 1;
 SELECT id INTO draft_id FROM public.billing_v2_cycles WHERE status='draft' AND NOT is_demo LIMIT 1;
 IF closed_id IS NULL OR draft_id IS NULL THEN RAISE EXCEPTION 'Need a closed and an open bulletin to verify';END IF;
 BEGIN UPDATE public.billing_v2_cycles SET status='draft' WHERE id=closed_id;RAISE EXCEPTION 'Reopening was allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN DELETE FROM public.billing_v2_cycles WHERE id=closed_id;RAISE EXCEPTION 'Deleting was allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE public.billing_v2_cycles SET client_portal_visible=NOT client_portal_visible WHERE id=closed_id;RAISE EXCEPTION 'Publishing was allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 SELECT m.id INTO movement_id FROM public.billing_v2_movements m JOIN public.billing_v2_cycles c ON c.id=m.cycle_id WHERE c.status='closed' AND NOT c.is_demo LIMIT 1;
 IF movement_id IS NULL THEN RAISE EXCEPTION 'Need a closed movement to verify'; END IF;
 IF movement_id IS NOT NULL THEN
 BEGIN UPDATE public.billing_v2_movements SET observation=observation WHERE id=movement_id;RAISE EXCEPTION 'Closed movement was editable';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN DELETE FROM public.billing_v2_movements WHERE id=movement_id;RAISE EXCEPTION 'Closed movement was deletable';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 END IF;
 SELECT s.id INTO service_id FROM public.billing_v2_cycle_services s JOIN public.billing_v2_cycles c ON c.id=s.cycle_id WHERE c.status='closed' LIMIT 1;
 IF service_id IS NULL THEN RAISE EXCEPTION 'Need a closed service to verify';END IF;
 IF service_id IS NOT NULL THEN
 BEGIN UPDATE public.billing_v2_cycle_services SET observation=observation WHERE id=service_id;RAISE EXCEPTION 'Closed service was editable';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 END IF;
 BEGIN PERFORM public.can_change_bulletin_file('movement-documents','cycle-invoices/'||closed_id||'/test.pdf');RAISE EXCEPTION 'Closed invoice file was editable';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF NOT public.can_change_bulletin_file('movement-documents','cycle-invoices/'||draft_id||'/test.pdf') THEN RAISE EXCEPTION 'Open invoice file blocked';END IF;
 UPDATE public.billing_v2_cycles SET period_end=period_end WHERE id=draft_id;
 GET DIAGNOSTICS rows_count=ROW_COUNT;IF rows_count<>1 THEN RAISE EXCEPTION 'Open bulletin not editable';END IF;
 UPDATE public.billing_v2_cycles SET status='closed',client_portal_visible=false WHERE id=draft_id;
 BEGIN UPDATE public.billing_v2_cycles SET period_end=period_end WHERE id=draft_id;RAISE EXCEPTION 'Newly finalized bulletin editable';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
-- Juliana retains normal access to closed BMs.
SELECT set_config('request.jwt.claim.sub','b2f6e43d-ce24-4de2-a770-0548793cc180',true);
DO $$DECLARE target uuid;BEGIN
 SELECT id INTO target FROM public.billing_v2_cycles WHERE status='closed' AND NOT is_demo LIMIT 1;
 UPDATE public.billing_v2_cycles SET period_end=period_end WHERE id=target;
 IF NOT FOUND THEN RAISE EXCEPTION 'Admin lost access';END IF;
END $$;
RESET ROLE;
UPDATE public.user_permissions SET permissions=array_remove(permissions,'billing_lock_finalized') WHERE user_id='688b03c1-d49c-46eb-b0a3-9aaf84c3f69e';
SELECT set_config('request.jwt.claim.sub','688b03c1-d49c-46eb-b0a3-9aaf84c3f69e',true);
SET LOCAL ROLE authenticated;
DO $$DECLARE target uuid;BEGIN
 SELECT id INTO target FROM public.billing_v2_cycles WHERE status='closed' AND NOT is_demo LIMIT 1;
 UPDATE public.billing_v2_cycles SET period_end=period_end WHERE id=target;
 IF NOT FOUND THEN RAISE EXCEPTION 'Turning the option off did not restore normal editing';END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: Angela keeps existing areas and open-BM editing; closed BMs reject edits, reopening, deletion, publication, child changes and attachments; admin preserved; rollback complete' result;
