import { useRef, useState, type RefObject } from "react";
import { Upload } from "lucide-react";
import { BillingButton, useBillingReadOnly } from "@/components/BillingReadOnly";

/** A real button activates a mounted native input synchronously within the user gesture. */
export function BillingInvoiceFilePicker({
  label,
  disabled = false,
  allowReadOnly = false,
  inputRef,
  onFile,
  blockedReason,
}: {
  label: string;
  disabled?: boolean;
  allowReadOnly?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void | Promise<unknown>;
  blockedReason?: string;
}) {
  const ownInput = useRef<HTMLInputElement>(null);
  const input = inputRef || ownInput;
  const pending = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const readOnly = useBillingReadOnly();
  const blocked = disabled || uploading || (readOnly && !allowReadOnly);
  return (
    <div className="space-y-1">
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        aria-label={label}
        disabled={blocked}
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file || blocked || pending.current) return;
          pending.current = true;
          setUploading(true);
          setError("");
          try {
            await onFile(file);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Não foi possível anexar o arquivo.");
          } finally {
            pending.current = false;
            setUploading(false);
          }
        }}
      />
      <BillingButton
        type="button"
        allowReadOnly={allowReadOnly}
        disabled={blocked}
        title={blocked ? blockedReason : undefined}
        onClick={() => {
          if (!blocked && !pending.current) input.current?.click();
        }}
      >
        <Upload className="mr-1 h-4 w-4" />
        {uploading ? "Salvando arquivo…" : label}
      </BillingButton>
      {blocked && blockedReason && (
        <p role="status" className="text-xs text-muted-foreground">
          {blockedReason}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
