/** Aviso fixo enquanto um administrador navega no portal como cliente. */
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { isImpersonatingClient, stopClientImpersonation } from "@/lib/client-impersonation";

export function ClientImpersonationBanner() {
  const { isClient, profile, user } = useAuth();
  const [leaving, setLeaving] = useState(false);
  if (!isClient || !isImpersonatingClient()) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-lg">
      <p className="min-w-0 text-sm">
        <span className="font-semibold">Você está como {profile?.full_name || user?.email}.</span>{" "}
        <span className="text-muted-foreground">O que for alterado aqui vale de verdade.</span>
      </p>
      <Button
        size="sm"
        disabled={leaving}
        onClick={() => {
          setLeaving(true);
          void stopClientImpersonation();
        }}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        {leaving ? "Voltando…" : "Voltar para o administrador"}
      </Button>
    </div>
  );
}
