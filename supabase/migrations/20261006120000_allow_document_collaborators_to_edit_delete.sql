-- Colaboradores com a permissão "documents" também podem editar e excluir
-- documentos (antes só liam e cadastravam). Vale para o registro e para o
-- arquivo no storage, já que editar pode substituir o arquivo e excluir o remove.
DROP POLICY IF EXISTS jacoby_client_documents_documents_update ON public.client_documents;
CREATE POLICY jacoby_client_documents_documents_update ON public.client_documents
  FOR UPDATE TO authenticated
  USING (public.has_app_permission('documents'))
  WITH CHECK (public.has_app_permission('documents'));

DROP POLICY IF EXISTS jacoby_client_documents_documents_delete ON public.client_documents;
CREATE POLICY jacoby_client_documents_documents_delete ON public.client_documents
  FOR DELETE TO authenticated
  USING (public.has_app_permission('documents'));

DROP POLICY IF EXISTS jacoby_client_documents_storage_documents_delete ON storage.objects;
CREATE POLICY jacoby_client_documents_storage_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND public.has_app_permission('documents')
  );

NOTIFY pgrst, 'reload schema';
