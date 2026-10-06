-- Anexos das movimentações aceitam qualquer tipo de arquivo (fotos, planilhas,
-- documentos etc.), não só PDF. O limite de 15 MB por arquivo continua.
UPDATE storage.buckets
SET allowed_mime_types = NULL
WHERE id = 'movement-documents';
