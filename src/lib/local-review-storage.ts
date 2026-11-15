/** Offline review files live in IndexedDB, never in Supabase or a production bucket. */
export type ReviewFile = {
  key: string;
  bucket: string;
  path: string;
  blob: Blob;
  createdAt: string;
};
export type ReviewFileStore = {
  read: (key: string) => Promise<ReviewFile | undefined>;
  write: (file: ReviewFile) => Promise<void>;
  remove: (key: string) => Promise<void>;
  all: () => Promise<ReviewFile[]>;
};
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("jacoby-local-review-files-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  }));
}
async function access<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("files", mode);
    const request = operation(transaction.objectStore("files"));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error || request.error);
    transaction.onabort = () => reject(transaction.error || new Error("Gravação local cancelada."));
  });
}
const browserStore: ReviewFileStore = {
  read: (key) => access("readonly", (store) => store.get(key)),
  write: async (file) => {
    await access("readwrite", (store) => store.put(file));
  },
  remove: async (key) => {
    await access("readwrite", (store) => store.delete(key));
  },
  all: () => access("readonly", (store) => store.getAll()),
};
export function createLocalReviewBucket(bucket: string, store: ReviewFileStore = browserStore) {
  const key = (path: string) => `${bucket}:${path}`;
  const result = async <T>(operation: () => Promise<T>) => {
    try {
      return { data: await operation(), error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Falha no armazenamento local.",
        },
      };
    }
  };
  return {
    upload: (path: string, blob: Blob, options?: { upsert?: boolean }) =>
      result(async () => {
        if (!options?.upsert && (await store.read(key(path))))
          throw new Error("Já existe um arquivo neste caminho local.");
        await store.write({
          key: key(path),
          bucket,
          path,
          blob,
          createdAt: new Date().toISOString(),
        });
        return { path };
      }),
    download: (path: string) =>
      result(async () => {
        const file = await store.read(key(path));
        if (!file) throw new Error("Arquivo não encontrado neste navegador.");
        return file.blob;
      }),
    remove: (paths: string[]) =>
      result(async () => {
        await Promise.all(paths.map((path) => store.remove(key(path))));
        return paths.map((name) => ({ name }));
      }),
    list: (
      folder = "",
      options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } },
    ) =>
      result(async () => {
        const prefix = folder ? `${folder}/` : "";
        const entries = new Map<
          string,
          { name: string; id: string | null; created_at: string; metadata: { size: number } }
        >();
        for (const file of await store.all()) {
          if (file.bucket !== bucket || !file.path.startsWith(prefix)) continue;
          const suffix = file.path.slice(prefix.length),
            name = suffix.split("/")[0];
          if (suffix.includes("/"))
            entries.set(name, {
              name,
              id: null,
              created_at: file.createdAt,
              metadata: { size: 0 },
            });
          else
            entries.set(name, {
              name,
              id: file.key,
              created_at: file.createdAt,
              metadata: { size: file.blob.size },
            });
        }
        const column = options?.sortBy?.column === "created_at" ? "created_at" : "name";
        return [...entries.values()]
          .sort(
            (a, b) =>
              a[column].localeCompare(b[column]) * (options?.sortBy?.order === "desc" ? -1 : 1),
          )
          .slice(options?.offset || 0, (options?.offset || 0) + (options?.limit ?? 100));
      }),
    createSignedUrl: (path: string, expiresIn = 600) =>
      result(async () => {
        const file = await store.read(key(path));
        if (!file) throw new Error("Arquivo não encontrado neste navegador.");
        const signedUrl = URL.createObjectURL(file.blob);
        setTimeout(() => URL.revokeObjectURL(signedUrl), Math.min(expiresIn, 3600) * 1000);
        return { signedUrl };
      }),
    getPublicUrl: () => ({
      data: { publicUrl: "" },
      error: { message: "Os arquivos locais são privados." },
    }),
  };
}
