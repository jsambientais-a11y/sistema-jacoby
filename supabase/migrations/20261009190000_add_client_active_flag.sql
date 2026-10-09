-- Situação do cliente na listagem de Clientes (Ativos / Inativos). Arquivar um
-- cliente só o tira da lista de ativos; não altera BMs, portal nem documentos.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
