// Um envio por vez; nunca repete uma revisão conflitante nem descarta alterações pendentes.
export class IsoSyncQueue<T> {
  private pending: T | undefined;
  private running = false;
  private stopped = false;
  revision: number;
  constructor(
    revision: number,
    private save: (revision: number, value: T) => Promise<number>,
    private saved: (value: T, revision: number) => void,
    private failed: (error: unknown) => void,
  ) {
    this.revision = revision;
  }
  get busy() {
    return !this.stopped && (this.running || this.pending !== undefined);
  }
  enqueue(value: T) {
    if (this.stopped) return;
    this.pending = value;
    void this.flush();
  }
  stop() {
    this.stopped = true;
  }
  private async flush() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (this.pending !== undefined && !this.stopped) {
        const value = this.pending;
        this.pending = undefined;
        const revision = await this.save(this.revision, value);
        if (this.stopped) return;
        this.revision = revision;
        this.saved(value, revision);
      }
    } catch (error) {
      this.stopped = true;
      this.failed(error);
    } finally {
      this.running = false;
    }
  }
}
