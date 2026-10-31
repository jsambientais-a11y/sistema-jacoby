
BEGIN;
CREATE TEMP TABLE recipient_snapshot AS SELECT (SELECT count(*) FROM public.billing_email_deliveries) deliveries;
DO $$DECLARE test_cycle uuid:='ea74ad5d-a234-49af-a2e7-33adf9bd91c2'; test_client uuid; test_email text; linked_cycle uuid; linked_client uuid; linked_email text; linked_user uuid; n integer; before_count integer; BEGIN
 SELECT c.client_id,lower(trim(cl.email)) INTO test_client,test_email FROM public.billing_v2_cycles c JOIN public.clients cl ON cl.id=c.client_id WHERE c.id=test_cycle;
 IF test_email IS NULL OR NOT EXISTS(SELECT 1 FROM public.billing_portal_email_recipients(test_cycle) r WHERE r.recipient_email=test_email AND r.recipient_type='client') THEN RAISE EXCEPTION 'Aquarius contact missing';END IF;
 PERFORM public.queue_billing_portal_emails(test_cycle,NULL);
 IF NOT EXISTS(SELECT 1 FROM public.billing_email_deliveries d WHERE d.cycle_id=test_cycle AND d.recipient_email=test_email AND d.recipient_user_id IS NULL) THEN RAISE EXCEPTION 'Queue missing client contact';END IF;
 SELECT count(*) INTO before_count FROM public.billing_email_deliveries d WHERE d.cycle_id=test_cycle;
 PERFORM public.queue_billing_portal_emails(test_cycle,NULL);
 IF before_count<>(SELECT count(*) FROM public.billing_email_deliveries d WHERE d.cycle_id=test_cycle) THEN RAISE EXCEPTION 'Repeated queue duplicated email';END IF;
 UPDATE public.clients SET email=upper(test_email)||'; '||test_email||', invalido; outro-homologacao@example.com' WHERE id=test_client;
 IF (SELECT count(*) FROM public.billing_portal_email_recipients(test_cycle))<>2 THEN RAISE EXCEPTION 'Email parsing/dedup failed';END IF;
 UPDATE public.clients SET email='outro-homologacao@example.com' WHERE id=test_client;
 PERFORM public.queue_billing_portal_emails(test_cycle,NULL);
 IF EXISTS(SELECT 1 FROM public.billing_email_deliveries d WHERE d.cycle_id=test_cycle AND d.recipient_email=test_email AND d.status='pending') THEN RAISE EXCEPTION 'Old contact remained pending';END IF;
 -- Mesmo endereço no cadastro e no login gera um único destinatário.
 SELECT c.id,c.client_id,u.email,u.id INTO linked_cycle,linked_client,linked_email,linked_user
 FROM public.billing_v2_cycles c JOIN public.client_user_links l ON l.client_id=c.client_id JOIN auth.users u ON u.id=l.user_id WHERE u.email IS NOT NULL ORDER BY c.id LIMIT 1;
 IF linked_cycle IS NULL THEN RAISE EXCEPTION 'No linked account for dedup test';END IF;
 UPDATE public.clients SET email=upper(linked_email) WHERE id=linked_client;
 IF (SELECT count(*) FROM public.billing_portal_email_recipients(linked_cycle) WHERE recipient_email=lower(linked_email))<>1 THEN RAISE EXCEPTION 'Linked/contact duplicate';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.billing_portal_email_recipients(linked_cycle) WHERE recipient_email=lower(linked_email) AND recipient_user_id=linked_user) THEN RAISE EXCEPTION 'Linked recipient identity lost';END IF;
END $$;
ROLLBACK;
SELECT 'PASS: Aquarius preview/queue, multiple emails, deduplication and changed contact; all queue/contact writes rolled back; no emails sent' result;
