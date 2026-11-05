import { jsPDF } from "jspdf";
import { reportDate, reportWeight, type WasteResidueReport } from "./waste-residue-report";

type Options = {
  clientName: string;
  report: WasteResidueReport;
  logo?: Uint8Array;
  generatedAt?: Date;
  sample?: boolean;
};
const C = {
  green: [28, 79, 53],
  accent: [64, 134, 83],
  ink: [39, 56, 46],
  muted: [102, 119, 109],
  light: [241, 247, 241],
  line: [219, 230, 220],
  white: [255, 255, 255],
} as const;
export function createWasteResidueReportPdf({
  clientName,
  report,
  logo,
  generatedAt = new Date(),
  sample = false,
}: Options) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const left = 16,
    right = 194,
    width = 178,
    bottom = 274;
  let y = 0;
  const color = (name: keyof typeof C) => doc.setTextColor(C[name][0], C[name][1], C[name][2]);
  const fill = (name: keyof typeof C) => doc.setFillColor(C[name][0], C[name][1], C[name][2]);
  const text = (
    value: string,
    x: number,
    at: number,
    size = 9,
    bold = false,
    align: "left" | "right" | "center" = "left",
  ) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(value, x, at, { align });
  };
  const lines = (value: string, maxWidth: number, size = 9) => {
    doc.setFontSize(size);
    return doc.splitTextToSize(value, maxWidth) as string[];
  };
  const generatedLabel = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(generatedAt);
  function brand(compact = false) {
    fill("white");
    doc.rect(0, 0, 210, 297, "F");
    if (logo) {
      const image = doc.getImageProperties(logo);
      const scale = Math.min(43 / image.width, (compact ? 17 : 23) / image.height);
      doc.addImage(logo, "PNG", left, compact ? 9 : 12, image.width * scale, image.height * scale);
    } else {
      color("green");
      text("Jacoby Soluções", left, 20, 14, true);
    }
    color("muted");
    text("PORTAL DO CLIENTE", right, compact ? 14 : 18, 8, true, "right");
    text(
      sample ? "PRÉVIA - DADOS FICTÍCIOS" : "GESTÃO AMBIENTAL",
      right,
      compact ? 20 : 25,
      7,
      false,
      "right",
    );
    doc.setDrawColor(...C.accent);
    doc.setLineWidth(0.7);
    doc.line(left, compact ? 30 : 42, right, compact ? 30 : 42);
    y = compact ? 40 : 55;
  }
  function newPage(title: string, subtitle: string) {
    doc.addPage();
    brand(true);
    color("green");
    text(title, left, y, 16, true);
    y += 7;
    color("muted");
    const wrapped = lines(subtitle, width, 8);
    doc.text(wrapped, left, y);
    y += wrapped.length * 4 + 7;
  }
  function section(title: string, subtitle?: string) {
    color("green");
    text(title, left, y, 12, true);
    y += 6;
    if (subtitle) {
      color("muted");
      const wrapped = lines(subtitle, width, 8);
      doc.text(wrapped, left, y);
      y += wrapped.length * 4 + 3;
    }
  }
  function summaryHeader() {
    fill("green");
    doc.roundedRect(left, y, width, 9, 1.5, 1.5, "F");
    color("white");
    text("RESÍDUO", left + 3, y + 5.8, 8, true);
    text("REGISTROS", 129, y + 5.8, 7, true, "right");
    text("PESO (kg)", 165, y + 5.8, 8, true, "right");
    text("% PESO", right - 3, y + 5.8, 7, true, "right");
    y += 9;
  }
  brand();
  color("green");
  text("Gestão de resíduos", left, y, 25, true);
  y += 10;
  color("ink");
  const clientLines = lines(clientName, width, 12);
  doc.setFont("helvetica", "bold");
  doc.text(clientLines, left, y);
  y += clientLines.length * 5.5 + 4;
  color("muted");
  text(report.period, left, y, 10);
  y += 8;
  const filterLines = lines(
    `Filial/pátio: ${report.branchLabel}   |   Resíduo: ${report.residueLabel}`,
    width - 8,
    8,
  );
  fill("light");
  doc.roundedRect(left, y, width, filterLines.length * 4 + 8, 2, 2, "F");
  color("ink");
  doc.text(filterLines, left + 4, y + 6);
  y += filterLines.length * 4 + 16;
  const metrics = [
    { label: "PESO MOVIMENTADO", value: `${reportWeight(report.totalKg)} kg` },
    { label: "MOVIMENTAÇÕES", value: String(report.rows.length) },
    { label: "TIPOS DE RESÍDUO", value: String(report.summary.length) },
  ];
  metrics.forEach((metric, i) => {
    const x = left + i * 61;
    fill("light");
    doc.roundedRect(x, y, 56, 23, 2, 2, "F");
    color("muted");
    text(metric.label, x + 4, y + 7, 7, true);
    color("green");
    text(metric.value, x + 4, y + 17, metric.value.length > 16 ? 12 : 16, true);
  });
  y += 35;
  section(
    "Distribuição por resíduo",
    "Peso e participação de cada resíduo dentro dos filtros selecionados.",
  );
  summaryHeader();
  for (const [index, item] of report.summary.entries()) {
    const label = lines(item.name, 89, 8.5);
    const rowHeight = Math.max(12, label.length * 4 + 7);
    if (y + rowHeight > bottom - 3) {
      newPage("Distribuição por resíduo", `${clientName} | ${report.period}`);
      summaryHeader();
    }
    if (index % 2 === 0) {
      fill("light");
      doc.rect(left, y, width, rowHeight, "F");
    }
    color("ink");
    doc.text(label, left + 3, y + 5);
    text(String(item.count), 129, y + 5, 8, false, "right");
    text(reportWeight(item.kg), 165, y + 5, 8.5, true, "right");
    text(`${reportWeight(item.percentage)}%`, right - 3, y + 5, 8, false, "right");
    if (item.percentage > 0) {
      fill("line");
      doc.roundedRect(left + 3, y + rowHeight - 3.5, 84, 1.3, 0.6, 0.6, "F");
      fill("accent");
      doc.roundedRect(
        left + 3,
        y + rowHeight - 3.5,
        Math.max(0.8, (84 * item.percentage) / 100),
        1.3,
        0.6,
        0.6,
        "F",
      );
    }
    y += rowHeight;
  }
  if (!report.summary.length) {
    color("muted");
    text("Nenhuma movimentação encontrada para estes filtros.", left + 3, y + 9);
    y += 18;
  }
  if (y + 86 > bottom) newPage("Evolução do período", `${clientName} | ${report.period}`);
  else y += 13;
  section(
    "Evolução mensal",
    "Peso movimentado em kg. O gráfico utiliza os mesmos filtros do relatório.",
  );
  const chartTop = y,
    chartHeight = 36,
    chartWidth = width - 8,
    slot = chartWidth / report.monthly.length;
  const maximum = Math.max(...report.monthly.map((item) => item.kg), 1);
  doc.setDrawColor(...C.line);
  doc.setLineWidth(0.3);
  doc.line(left + 4, chartTop + chartHeight, right - 4, chartTop + chartHeight);
  report.monthly.forEach((item, index) => {
    const x = left + 4 + index * slot,
      barWidth = Math.min(22, slot * 0.48),
      height = (chartHeight * Math.max(0, item.kg)) / maximum;
    if (height > 0) {
      fill("accent");
      doc.roundedRect(
        x + (slot - barWidth) / 2,
        chartTop + chartHeight - height,
        barWidth,
        height,
        1,
        1,
        "F",
      );
    }
    color("muted");
    text(item.name, x + slot / 2, chartTop + chartHeight + 5, 7, false, "center");
    if (item.kg !== 0) {
      color("ink");
      text(
        reportWeight(item.kg),
        x + slot / 2,
        chartTop + chartHeight - height - 2,
        report.monthly.length > 1 ? 6 : 8,
        false,
        "center",
      );
    }
  });
  y = chartTop + chartHeight + 16;
  color("muted");
  const note = lines(
    "Variações de madeira são agrupadas como MADEIRA. Registros sem identificação de resíduo permanecem no total e são sinalizados no detalhamento.",
    width,
    7.5,
  );
  doc.text(note, left, y);
  y += note.length * 3.5 + 13;
  if (y > bottom - 70) {
    newPage("Movimentações do período", `${clientName} | ${report.period}\n${report.branchLabel} | ${report.residueLabel}`);
  } else {
    section("Movimentações do período", `${report.branchLabel} | ${report.residueLabel}`);
  }
  const starts = [left, left + 21, left + 69, left + 121, left + 147];
  const widths = [21, 48, 52, 26, 31];
  function detailHeader() {
    fill("green");
    doc.roundedRect(left, y, width, 9, 1.5, 1.5, "F");
    color("white");
    ["DATA", "RESÍDUO", "FILIAL/PÁTIO", "OS", "PESO (kg)"].forEach((label, i) =>
      text(
        label,
        i === 4 ? right - 3 : starts[i] + 3,
        y + 5.8,
        7.5,
        true,
        i === 4 ? "right" : "left",
      ),
    );
    y += 9;
  }
  detailHeader();
  for (const [index, row] of report.rows.entries()) {
    const cells = [
      reportDate(row.date),
      row.residue,
      row.branch,
      row.serviceOrder,
      reportWeight(row.kg),
    ];
    const wrapped = cells.map((cell, i) => lines(cell, widths[i] - 6, 8));
    const height = Math.max(10, ...wrapped.map((cell) => cell.length * 3.7 + 5));
    if (y + height > bottom - 10) {
      newPage(
        "Movimentações do período",
        `${clientName} | ${report.period}\n${report.branchLabel} | ${report.residueLabel}`,
      );
      detailHeader();
    }
    if (index % 2 === 0) {
      fill("light");
      doc.rect(left, y, width, height, "F");
    }
    color("ink");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    wrapped.forEach((cell, i) =>
      doc.text(cell, i === 4 ? right - 3 : starts[i] + 3, y + 5, {
        align: i === 4 ? "right" : "left",
        lineHeightFactor: 1.3,
      }),
    );
    y += height;
  }
  if (!report.rows.length) {
    color("muted");
    text("Nenhuma movimentação encontrada para estes filtros.", left + 3, y + 10);
    y += 20;
  }
  if (y + 14 > bottom) {
    newPage("Total do período", `${clientName} | ${report.period}`);
  }
  fill("green");
  doc.roundedRect(left, y + 2, width, 11, 1.5, 1.5, "F");
  color("white");
  text(`TOTAL - ${report.rows.length} movimentações`, left + 3, y + 9, 8, true);
  text(`${reportWeight(report.totalKg)} kg`, right - 3, y + 9, 10, true, "right");
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.3);
    doc.line(left, 281, right, 281);
    color("muted");
    text(
      sample ? "PRÉVIA VISUAL - DADOS FICTÍCIOS" : "Jacoby Soluções Ambientais | Portal do Cliente",
      left,
      286,
      7,
    );
    text(`Emitido em ${generatedLabel} (Brasília)`, left, 290, 6.5);
    text(`${page} / ${pages}`, right, 287, 8, false, "right");
  }
  doc.setProperties({
    title: `Relatório de resíduos - ${clientName}`,
    author: "Jacoby Soluções Ambientais",
    subject: `${report.period} | ${report.branchLabel} | ${report.residueLabel}`,
    creator: "Portal do Cliente - Jacoby",
  });
  const slug =
    clientName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 70) || "cliente";
  return {
    doc,
    fileName: `relatorio-residuos-${slug}-${report.filters.year}${report.filters.month === "todos" ? "" : `-${report.filters.month}`}.pdf`,
  };
}
