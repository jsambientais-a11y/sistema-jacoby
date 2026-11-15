type AttachmentRecord = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  subtask_id?: string;
};
type Result<T> = { data: T | null; error: { message: string; code?: string } | null };
type AttachmentClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        file: File,
        options: { contentType: string; upsert: boolean },
      ) => PromiseLike<{ error: { message: string; code?: string } | null }>;
      remove: (paths: string[]) => PromiseLike<unknown>;
    };
  };
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => {
      select: (columns: string) => { single: () => PromiseLike<Result<AttachmentRecord>> };
    };
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => { limit: (count: number) => PromiseLike<Result<{ id: string }[]>> };
    };
  };
};
export const TASK_ATTACHMENT_BUCKET = "task-attachments";
export const MAX_TASK_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export function validateTaskAttachment(file: Pick<File, "size">) {
  if (!file.size) throw new Error("O arquivo está vazio.");
  if (file.size > MAX_TASK_ATTACHMENT_SIZE) throw new Error("O arquivo deve ter no máximo 10 MB.");
}
export function taskAttachmentPath(
  taskId: string,
  filename: string,
  fileId: string,
  subtaskId?: string,
) {
  if (
    ![taskId, fileId, ...(subtaskId ? [subtaskId] : [])].every((value) =>
      /^[a-zA-Z0-9_-]+$/.test(value),
    )
  )
    throw new Error("Identificador de tarefa ou anexo inválido.");
  const name =
    filename
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-160) || "arquivo";
  return `${taskId}/${subtaskId ? `subtasks/${subtaskId}/` : ""}${fileId}--${name}`;
}
/** Metadata failure may have an uncertain outcome: never delete a possibly referenced object. */
export async function uploadTaskAttachment({
  client,
  file,
  taskId,
  userId,
  subtaskId,
  fileId = crypto.randomUUID(),
}: {
  client: unknown;
  file: File;
  taskId: string;
  userId: string;
  subtaskId?: string;
  fileId?: string;
}) {
  validateTaskAttachment(file);
  const connection = client as AttachmentClient;
  const path = taskAttachmentPath(taskId, file.name, fileId, subtaskId);
  const bucket = connection.storage.from(TASK_ATTACHMENT_BUCKET);
  const table = connection.from(subtaskId ? "subtask_attachments" : "attachments");
  const uploaded = await bucket.upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploaded.error)
    throw new Error(`Não foi possível enviar o arquivo: ${uploaded.error.message}`);
  const result = await table
    .insert({
      task_id: taskId,
      ...(subtaskId ? { subtask_id: subtaskId } : {}),
      file_name: file.name,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: userId,
    })
    .select("*")
    .single();
  if (result.error || !result.data) {
    const current = await connection
      .from(subtaskId ? "subtask_attachments" : "attachments")
      .select("id")
      .eq("storage_path", path)
      .limit(1);
    const rejected = ["42501", "23503", "23514", "23505", "22P02", "PGRST204"].includes(
      result.error?.code || "",
    );
    if (rejected && !current.error && !current.data?.length) await bucket.remove([path]);
    throw new Error(
      `Não foi possível registrar o anexo. Confira a lista antes de repetir: ${result.error?.message || "registro não confirmado"}`,
    );
  }
  return result.data;
}
/** One shared lock covers task and subtask uploads before any async draft creation. */
export function createTaskUploadLock() {
  let pending = false;
  return async (upload: () => Promise<void>) => {
    if (pending) throw new Error("Aguarde o envio em andamento.");
    pending = true;
    try {
      await upload();
    } finally {
      pending = false;
    }
  };
}
