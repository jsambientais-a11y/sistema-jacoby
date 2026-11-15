\set ON_ERROR_STOP on
ALTER TABLE public.billing_v2_cycle_services ADD COLUMN invoice_pdf_name text, ADD COLUMN amount numeric DEFAULT 100;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.billing_v2_cycle_services TO authenticated;
INSERT INTO public.billing_v2_cycle_services(id,cycle_id,invoice_pdf_path,invoice_pdf_name) VALUES('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','cycle-invoices/20000000-0000-4000-8000-000000000001/old.pdf','old.pdf');
INSERT INTO storage.objects(bucket_id,name) VALUES('movement-documents','cycle-invoices/20000000-0000-4000-8000-000000000001/old.pdf');
UPDATE public.user_permissions SET permissions=array_append(permissions,'billing_manage_finalized_invoices') WHERE user_id='00000000-0000-4000-8000-000000000005';
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
SET ROLE authenticated;
DO $$BEGIN
 INSERT INTO storage.objects(bucket_id,name) VALUES('movement-documents','service-invoices/50000000-0000-4000-8000-000000000001/new.xml');
 UPDATE public.billing_v2_cycle_services SET invoice_pdf_path='service-invoices/50000000-0000-4000-8000-000000000001/new.xml',invoice_pdf_name='new.xml';
 UPDATE public.billing_v2_cycle_services SET invoice_pdf_name='correct.xml';
 BEGIN UPDATE public.billing_v2_cycle_services SET amount=999; RAISE EXCEPTION 'Amount allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE public.billing_v2_cycle_services SET invoice_pdf_path='cycle-invoices/20000000-0000-4000-8000-000000000002/other.pdf'; RAISE EXCEPTION 'Wrong cycle allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN DELETE FROM public.billing_v2_cycle_services; RAISE EXCEPTION 'Delete service allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE billing_v2_cycles SET status='draft' WHERE id='20000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'Reopen allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 DELETE FROM storage.objects WHERE name LIKE '%old.pdf';
 UPDATE public.billing_v2_cycle_services SET invoice_pdf_path=NULL,invoice_pdf_name=NULL;
 DELETE FROM storage.objects WHERE name LIKE '%new.xml';
 IF EXISTS(SELECT 1 FROM public.billing_v2_cycle_services WHERE amount<>100) THEN RAISE EXCEPTION 'Values changed'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
SET ROLE authenticated;
DO $$BEGIN
 BEGIN UPDATE public.billing_v2_cycle_services SET invoice_pdf_name='no.pdf'; RAISE EXCEPTION 'Other account allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SELECT 'PASS: full attachment management; service amounts/delete/reopen/other accounts remain blocked';
