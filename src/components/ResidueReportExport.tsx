import { useState } from "react";
import { Download, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePdfPreview } from "@/components/PdfPreviewDialog";
import jacobyLogo from "@/assets/jacoby-logo-transparent.png";
import type { WasteResidueReport } from "@/lib/waste-residue-report";

export function ResidueReportExport({
  clientName,
  report,
  loading = false,
  error = false,
}: {
  clientName: string;
  report: WasteResidueReport;
  loading?: boolean;
  error?: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const { openPdfPreview, pdfPreviewDialog } = usePdfPreview();
  const disabled = loading || error || !report.rows.length || exporting;
  const generate = async (preview: boolean) => {
    if (disabled) return;
    setExporting(true);
    try {
      // Capture this account's report before loading the PDF renderer.
      const { createWasteResidueReportPdf } = await import("@/lib/waste-residue-report-pdf");
      const response = await fetch(jacobyLogo);
      if (!response.ok)
        throw new Error("Não foi possível carregar a identidade visual do relatório.");
      const { doc, fileName } = createWasteResidueReportPdf({
        clientName,
        report,
        logo: new Uint8Array(await response.arrayBuffer()),
      });
      if (preview)
        openPdfPreview({
          title: "Relatório de resíduos",
          subtitle: `${clientName} · ${report.period}`,
          fileName,
          url: URL.createObjectURL(doc.output("blob")),
          revokeOnClose: true,
        });
      else doc.save(fileName);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Não foi possível gerar o PDF. Tente novamente.",
      );
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      {pdfPreviewDialog}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={disabled} onClick={() => void generate(true)}>
          <Eye className="mr-2 h-4 w-4" />
          {exporting ? "Gerando…" : "Visualizar PDF"}
        </Button>
        <Button disabled={disabled} onClick={() => void generate(false)}>
          <Download className="mr-2 h-4 w-4" />
          {exporting ? "Gerando…" : "Baixar PDF"}
        </Button>
      </div>
    </>
  );
}
