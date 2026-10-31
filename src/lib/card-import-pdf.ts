/** Extração local: o arquivo não é enviado a terceiros. PDFs escaneados não têm texto. */
export async function cardPdfLines(bytes: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 40) throw new Error("A fatura deve ter no máximo 40 páginas.");
    const lines: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const text = await page.getTextContent();
      const groups = new Map<number, { x: number; text: string }[]>();
      for (const item of text.items) {
        if (!("str" in item)) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        groups.set(y, [...(groups.get(y) || []), { x: item.transform[4], text: item.str }]);
      }
      for (const [, items] of [...groups.entries()].sort((a, b) => b[0] - a[0]))
        lines.push(
          items
            .sort((a, b) => a.x - b.x)
            .map((x) => x.text)
            .join(" "),
        );
      page.cleanup();
    }
    return lines;
  } catch (e) {
    if (e instanceof Error && e.name === "PasswordException")
      throw new Error(
        "O PDF está protegido por senha. Exporte uma cópia desbloqueada ou use CSV/OFX.",
      );
    throw e;
  } finally {
    await task.destroy();
  }
}
