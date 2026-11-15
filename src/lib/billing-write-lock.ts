/** Hold the lock through the write and cache refresh, including synchronous double clicks. */
export function createBillingWriteLock() {
  let pending = false;
  return async function exclusive<T>(write: () => Promise<T>): Promise<T> {
    if (pending) throw new Error("Aguarde a gravação em andamento.");
    pending = true;
    try {
      return await write();
    } finally {
      pending = false;
    }
  };
}
