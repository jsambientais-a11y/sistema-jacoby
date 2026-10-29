BEGIN;
CREATE OR REPLACE FUNCTION public.iso_json_valid(value jsonb, spec jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE k text; child jsonb; variant jsonb; matched boolean;
BEGIN
 IF value IS NULL THEN RETURN false; END IF;
 IF spec ? 'anyOf' THEN
  FOR variant IN SELECT jsonb_array_elements(spec->'anyOf') LOOP IF public.iso_json_valid(value,variant) THEN RETURN true; END IF; END LOOP;
  RETURN false;
 END IF;
 IF spec ? 'type' AND jsonb_typeof(value)<>spec->>'type' THEN RETURN false; END IF;
 IF spec ? 'enum' AND NOT (spec->'enum' @> jsonb_build_array(value)) THEN RETURN false; END IF;
 IF jsonb_typeof(value)='object' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(value) AS x(key) WHERE key IN ('__proto__','prototype','constructor')) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(spec->'required','[]'::jsonb)) x(key) WHERE NOT(value ? key)) THEN RETURN false; END IF;
  FOR k,child IN SELECT * FROM jsonb_each(value) LOOP
   IF spec->'properties' ? k THEN IF NOT public.iso_json_valid(child,spec->'properties'->k) THEN RETURN false; END IF;
   ELSIF jsonb_typeof(spec->'additionalProperties')='object' THEN IF NOT public.iso_json_valid(child,spec->'additionalProperties') THEN RETURN false; END IF;
   ELSIF spec->'additionalProperties'='false'::jsonb THEN RETURN false;
   ELSIF NOT public.iso_json_valid(child,'{}'::jsonb) THEN RETURN false;
   END IF;
  END LOOP;
 ELSIF jsonb_typeof(value)='array' THEN
  IF spec ? 'minItems' AND jsonb_array_length(value)<(spec->>'minItems')::int THEN RETURN false; END IF;
  FOR child IN SELECT jsonb_array_elements(value) LOOP IF NOT public.iso_json_valid(child,coalesce(spec->'items','{}'::jsonb)) THEN RETURN false; END IF; END LOOP;
 ELSIF jsonb_typeof(value)='string' THEN
  IF spec ? 'pattern' AND (value#>>'{}') !~ (spec->>'pattern') THEN RETURN false; END IF;
 ELSIF jsonb_typeof(value)='number' THEN
  IF spec ? 'minimum' AND value::text::numeric<(spec->>'minimum')::numeric THEN RETURN false; END IF;
  IF spec ? 'maximum' AND value::text::numeric>(spec->>'maximum')::numeric THEN RETURN false; END IF;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.iso_json_valid(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
DO $history$ BEGIN IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261029183000','iso_validate_unknown_fields',ARRAY['Validate unknown nested fields in ISO compatible audit data']) ON CONFLICT(version) DO NOTHING;
END IF; END $history$;
COMMIT;
