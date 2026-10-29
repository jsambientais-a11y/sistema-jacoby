export async function createIsoTextPdf(title: string, sections: { title: string; text: string }[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  let y = 30;
  for (const section of [{ title, text: "Jacoby Gestão ISO" }, ...sections]) {
    for (const [value, bold] of [
      [section.title, true],
      [section.text, false],
    ] as const) {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(bold ? 12 : 10);
      for (const line of doc.splitTextToSize(value || "Não informado", 178)) {
        if (y > 276) {
          doc.addPage();
          y = 30;
        }
        doc.text(line, 16, y);
        y += bold ? 7 : 5;
      }
      y += 3;
    }
  }
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`${title} · ${p}/${doc.getNumberOfPages()}`, 16, 289);
  }
  return doc;
}
