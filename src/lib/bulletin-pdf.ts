/**
 * Gerador único do PDF do Boletim de Medição.
 * Usado pela equipe (Boletim de Medição) e pelo cliente (Portal › Boletins emitidos),
 * para que os dois vejam exatamente o mesmo documento.
 */
import jacobyLogo from "@/assets/jacoby-logo-transparent.png";

export const BRANCH_MATRIZ = "__matriz__";

export type BulletinPdfCycle = {
  id: string;
  client_id: string;
  branch_id: string | null;
  period_start: string;
  period_end: string;
  issuer_type: "jacoby" | "outsourced" | string;
  outsourced_company_id: string | null;
  bulletin_number: number;
};
export type BulletinPdfPlacement = {
  branch_id: string | null;
  equipment_id: string;
  quantity: number;
  monthly_rental_rate: number;
  observation: string | null;
};
export type BulletinPdfMovement = {
  branch_id: string | null;
  equipment_id: string | null;
  replacement_equipment_id: string | null;
  waste_residue_id: string | null;
  service_order: string | null;
  removed_quantity: number;
  weight_kg: number;
  confirmed: boolean;
  treatment_rate: number;
  exchange_rate: number;
  observation: string | null;
};
export type BulletinPdfService = {
  waste_service_id: string;
  outsourced_company_id: string | null;
  amount: number;
  quantity: number;
  unit_amount: number | null;
  observation: string | null;
};
export type BulletinPdfCompany = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  logo_url: string | null;
  cnpj: string | null;
  address: string | null;
  postal_code: string | null;
  phone: string | null;
  environmental_license: string | null;
};
export type BulletinPdfCompanyProfile = Omit<BulletinPdfCompany, "id"> & { email?: string | null };
export type BulletinPdfBranch = { id: string; name: string; cnpj: string | null; address: string | null };
export type BulletinPdfClient = {
  name: string;
  trade_name?: string | null;
  legal_name?: string | null;
  cnpj?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};
export type BulletinPdfEquipment = { id: string; identification: string | null; name: string; equipment_type: string };

export type BulletinPdfInput = {
  cycle: BulletinPdfCycle;
  placements: BulletinPdfPlacement[];
  movements: BulletinPdfMovement[];
  services: BulletinPdfService[];
  /** "all" ou o id do resíduo de uma emissão filtrada. */
  residueId?: string;
  bulletinLabel?: string;
  client?: BulletinPdfClient | null;
  branches: BulletinPdfBranch[];
  equipment: BulletinPdfEquipment[];
  residues: { id: string; name: string }[];
  wasteServices: { id: string; name: string }[];
  outsourcedCompanies: BulletinPdfCompany[];
  companyProfile: BulletinPdfCompanyProfile | null;
  /** Empresa de tratamento escolhida na hora pela equipe (não fica salva). */
  treatmentCompanyId?: string | null;
};

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const number = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value || 0);
export const bulletinNumber = (value?: number | null) => `#${String(value || 0).padStart(3, "0")}`;
const equipmentName = (item?: BulletinPdfEquipment) =>
  item ? [item.identification, item.name, item.equipment_type].filter(Boolean).join(" · ") : "Equipamento";
const logoAsDataUrl = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw Error("Logo indisponível");
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

export const bulletinPdfFileName = (label: string, clientName: string) =>
  `boletim-${label.replace("#", "")}-${clientName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`;

export async function generateBulletinPdf(input: BulletinPdfInput): Promise<{ fileName: string; blob: Blob }> {
  const printableCycle = input.cycle;
  const pdfPlacements = input.placements;
  const pdfMovements = input.movements;
  const pdfServices = input.services;
  const pdfResidueId = input.residueId ?? "all";
  const printableBulletinNumber = input.bulletinLabel || bulletinNumber(printableCycle.bulletin_number);
  const pdfClient = input.client ?? undefined;
  const pdfClientName = pdfClient?.name || "Cliente";
  const { equipment, residues, outsourcedCompanies, companyProfile } = input;
  const services = input.wasteServices;
  const branch = (id: string) => input.branches.find((item) => item.id === id);
  const pdfResidueName = pdfResidueId === "all" ? "Todos os resíduos" : residues.find((item) => item.id === pdfResidueId)?.name || "Resíduo selecionado";
  const pdfTreatmentCompany = input.treatmentCompanyId ? outsourcedCompanies.find((company) => company.id === input.treatmentCompanyId) : undefined;
  const pdfIssuerCompany = outsourcedCompanies.find((company) => company.id === printableCycle.outsourced_company_id);
  const pdfServiceCompany = pdfIssuerCompany || outsourcedCompanies.find((company) =>
    pdfServices.some((service) => service.outsourced_company_id === company.id),
  );
  const confirmedMovements = pdfMovements.filter((item) => item.confirmed);
  const branchIds = Array.from(new Set([...pdfPlacements, ...confirmedMovements].map((item) => item.branch_id).filter((value): value is string => Boolean(value))));
  if (!branchIds.length && printableCycle?.branch_id) branchIds.push(printableCycle.branch_id);
  // Itens sem filial/pátio pertencem à Matriz e ganham página própria no PDF.
  const hasMatrizItems = [...pdfPlacements, ...confirmedMovements].some((item) => !item.branch_id);
  if (hasMatrizItems && branchIds.length) branchIds.push(BRANCH_MATRIZ);
  if (!printableCycle || (!branchIds.length && !hasMatrizItems && !pdfServices.length)) {
    throw new Error("Registre uma locação, movimentação ou serviço antes de gerar o PDF.");
  }
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const jacoby = companyProfile || { legal_name: "JACOBY SOLUÇÕES AMBIENTAIS", trade_name: "Jacoby Soluções Ambientais", cnpj: null, address: null, postal_code: null, phone: null, email: null, environmental_license: null, logo_url: null };
  // Se a terceirizada não estiver acessível (ex.: permissão do cliente), não atribui a nota à Jacoby.
  const issuerName = printableCycle.issuer_type === "outsourced"
    ? pdfIssuerCompany?.trade_name || pdfIssuerCompany?.legal_name || "RESPONSÁVEL"
    : jacoby.trade_name || jacoby.legal_name;
  const companyDetails = (company: { cnpj?: string | null; address?: string | null; postal_code?: string | null; phone?: string | null; environmental_license?: string | null }) =>
    [company.cnpj && `CNPJ: ${company.cnpj}`, company.address, company.postal_code && `CEP: ${company.postal_code}`, company.phone && `Fone: ${company.phone}`, company.environmental_license && `Licença: ${company.environmental_license}`].filter(Boolean).join(" · ");
  // Paleta do PDF: verde Jacoby intenso, com o amarelo da borboleta como acento.
  const C = {
    deep: [20, 83, 45], primary: [23, 128, 58], glow: [47, 174, 78], amber: [245, 166, 35],
    tint: [233, 246, 236], soft: [246, 250, 247], ink: [30, 45, 33], muted: [95, 111, 98],
    border: [221, 231, 222], onDeep: [178, 224, 190],
  } as const;
  type RGB = readonly [number, number, number] | readonly number[];
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const ink = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const fit = (text: string, maxWidth: number) => {
    if (doc.getTextWidth(text) <= maxWidth) return text;
    let cut = text;
    while (cut.length && doc.getTextWidth(`${cut}...`) > maxWidth) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}...`;
  };
  const LABEL_SPACING = 0.45;
  // Rótulo em caixa alta espaçada; o alinhamento considera o espaçamento entre letras.
  const labelWidth = (text: string) => doc.getTextWidth(text) + LABEL_SPACING * Math.max(0, text.length - 1);
  const label = (text: string, x: number, y: number, color: RGB, size = 6.5, align: "left" | "center" | "right" = "left") => {
    ink(color); doc.setFont("helvetica", "bold"); doc.setFontSize(size);
    const width = labelWidth(text);
    const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
    doc.setCharSpace(LABEL_SPACING); doc.text(text, left, y); doc.setCharSpace(0);
  };
  // Selo com o papel da empresa (Gerenciadora, Nota do serviço, Tratamento) na cor do papel.
  const rolePill = (text: string, x: number, y: number, color: RGB, maxWidth: number, align: "left" | "center" = "left") => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.8);
    const content = fit(text, maxWidth - 6 - LABEL_SPACING * text.length);
    const width = labelWidth(content) + 6;
    const left = align === "center" ? x - width / 2 : x;
    doc.setFillColor(...(color.map((value) => Math.round(value + (255 - value) * 0.86)) as [number, number, number]));
    doc.roundedRect(left, y - 3.4, width, 4.8, 2.4, 2.4, "F");
    label(content, left + 3, y, color, 5.8);
  };
  const drawLogo = async (url: string | null | undefined, x: number, y: number, w: number, h: number, fallback = false) => {
    try {
      let source: string | HTMLImageElement | null = null;
      let naturalW = 0, naturalH = 0, format = "PNG";
      if (url) {
        const dataUrl = await logoAsDataUrl(url);
        const props = doc.getImageProperties(dataUrl);
        source = dataUrl; naturalW = props.width; naturalH = props.height; format = (props.fileType || "PNG").toUpperCase();
      } else if (fallback) {
        const image = new Image(); image.src = jacobyLogo; await image.decode();
        source = image; naturalW = image.naturalWidth; naturalH = image.naturalHeight;
      }
      if (!source || !naturalW || !naturalH) return;
      // Mantém a proporção original do logo dentro da área disponível (sem esticar).
      const scale = Math.min(w / naturalW, h / naturalH);
      const drawW = naturalW * scale, drawH = naturalH * scale;
      doc.addImage(source as any, format, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
    } catch {}
  };
  const drawHeader = async (pageBranch: BulletinPdfBranch | null, pageIndex: number) => {
    if (pageIndex) doc.addPage();
    fill(C.deep); doc.rect(0, 0, 210, 40, "F");
    fill(C.glow); doc.rect(0, 40, 150, 1.4, "F");
    fill(C.amber); doc.rect(150, 40, 60, 1.4, "F");
    label("BOLETIM DE MEDIÇÃO", 14, 12, C.onDeep, 7.5);
    ink([255, 255, 255]); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text(fit(pdfClientName.toUpperCase(), 128), 14, 21);
    const period = `Período: ${new Date(`${printableCycle.period_start}T12:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${printableCycle.period_end}T12:00:00`).toLocaleDateString("pt-BR")}`;
    ink([214, 238, 220]); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    doc.text(fit(pdfResidueId !== "all" ? `${period}  ·  Resíduo: ${pdfResidueName}` : period, 128), 14, 28);
    ink(C.onDeep); doc.setFontSize(7.2);
    doc.text(`Emitido em ${new Date().toLocaleDateString("pt-BR")}`, 14, 34);
    doc.setFillColor(255, 255, 255); doc.roundedRect(150, 8.5, 46, 24, 3, 3, "F");
    label("Nº DO BOLETIM", 173, 15, C.muted, 6, "center");
    ink(C.primary); doc.setFont("helvetica", "bold"); doc.setFontSize(18);
    doc.text(fit(printableBulletinNumber, 40), 173, 26.5, { align: "center" });

    const invoiceIssuerNotice = `NOTA FISCAL SERÁ EMITIDA PELA ${printableCycle.issuer_type === "outsourced" ? `TERCEIRIZADA ${issuerName.toUpperCase()}` : "JACOBY SOLUÇÕES AMBIENTAIS"}`;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.8);
    const noticeLines = doc.splitTextToSize(invoiceIssuerNotice, 158);
    const noticeHeight = Math.max(12, 7 + noticeLines.length * 4);
    const noticeY = 48;
    fill(C.tint); doc.roundedRect(14, noticeY, 182, noticeHeight, 2.5, 2.5, "F");
    fill(C.primary); doc.circle(22, noticeY + noticeHeight / 2, 3.2, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(5.4); doc.text("NF", 22, noticeY + noticeHeight / 2 + 0.75, { align: "center" });
    ink(C.deep); doc.setFontSize(8.8);
    doc.text(noticeLines, 29, noticeY + noticeHeight / 2 - (noticeLines.length - 1) * 2 + 1.4, { lineHeightFactor: 1.1 });

    const companyY = noticeY + noticeHeight + 5;
    type HeaderParty = { role: string; name: string; details: string; logo: string | null; fallback?: boolean; color: RGB };
    const parties: HeaderParty[] = [
    // O logo oficial da Jacoby vem do próprio sistema (vetorizado e nítido), não do cadastro.
      { role: "Gerenciadora", name: jacoby.trade_name || jacoby.legal_name, details: companyDetails(jacoby), logo: null, fallback: true, color: C.primary },
    ];
    const serviceColor: RGB = [217, 119, 6];
    const treatmentColor: RGB = [13, 148, 136];
    const treatmentRole = `Tratamento${pdfResidueId !== "all" ? ` · ${pdfResidueName}` : ""}`;
    if (pdfServiceCompany && pdfTreatmentCompany && pdfServiceCompany.id === pdfTreatmentCompany.id) {
      parties.push({ role: `Nota do serviço · ${treatmentRole}`, name: pdfServiceCompany.trade_name || pdfServiceCompany.legal_name, details: companyDetails(pdfServiceCompany), logo: pdfServiceCompany.logo_url || null, color: serviceColor });
    } else {
      if (pdfServiceCompany) parties.push({ role: "Nota do serviço", name: pdfServiceCompany.trade_name || pdfServiceCompany.legal_name, details: companyDetails(pdfServiceCompany), logo: pdfServiceCompany.logo_url || null, color: serviceColor });
      if (pdfTreatmentCompany) parties.push({ role: treatmentRole, name: pdfTreatmentCompany.trade_name || pdfTreatmentCompany.legal_name, details: companyDetails(pdfTreatmentCompany), logo: pdfTreatmentCompany.logo_url || null, color: treatmentColor });
    }
    const single = parties.length === 1;
    const cardGap = 4;
    const cardWidth = (182 - (parties.length - 1) * cardGap) / parties.length;
    const cardHeight = single ? 30 : 46;
    doc.setLineWidth(0.3);
    for (let i = 0; i < parties.length; i++) {
      const party = parties[i];
      const cardX = 14 + i * (cardWidth + cardGap);
      doc.setFillColor(255, 255, 255); stroke(C.border);
      doc.roundedRect(cardX, companyY, cardWidth, cardHeight, 3, 3, "FD");
      const details = party.details || "Dados cadastrais não informados.";
      if (single) {
        await drawLogo(party.logo, cardX + 8, companyY + 7, 38, 16, party.fallback);
        const tx = cardX + 55, tw = cardWidth - 61;
        rolePill(party.role.toUpperCase(), tx, companyY + 10, party.color, tw);
        ink(C.ink); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text(fit(party.name, tw), tx, companyY + 16);
        ink(C.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(6.4);
        doc.text(doc.splitTextToSize(details, tw).slice(0, 2), tx, companyY + 21, { lineHeightFactor: 1.2 });
      } else {
        const cx = cardX + cardWidth / 2;
        const logoW = Math.min(cardWidth - 12, 42);
        await drawLogo(party.logo, cx - logoW / 2, companyY + 5, logoW, 14, party.fallback);
        rolePill(party.role.toUpperCase(), cx, companyY + 25.5, party.color, cardWidth - 8, "center");
        ink(C.ink); doc.setFont("helvetica", "bold"); doc.setFontSize(8.2);
        doc.text(fit(party.name, cardWidth - 8), cx, companyY + 31, { align: "center" });
        ink(C.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(5.8);
        doc.text(doc.splitTextToSize(details, cardWidth - 8).slice(0, 3), cx, companyY + 35.5, { align: "center", lineHeightFactor: 1.15 });
      }
    }
    const y = companyY + cardHeight + 5;
    const generatorName = pageBranch?.name || pdfClient?.trade_name || pdfClient?.legal_name || `${pdfClientName} (Matriz)`;
    const generatorDetails = pageBranch
      ? [pageBranch.cnpj && `CNPJ: ${pageBranch.cnpj}`, pageBranch.address].filter(Boolean).join(" · ")
      : [
          pdfClient?.cnpj && `CNPJ: ${pdfClient.cnpj}`,
          pdfClient?.address,
          pdfClient?.phone && `Fone: ${pdfClient.phone}`,
          pdfClient?.email,
        ].filter(Boolean).join(" · ");
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    const generatorLines = doc.splitTextToSize(generatorDetails || "Dados cadastrais não informados.", 168).slice(0, 2);
    const generatorHeight = 17 + generatorLines.length * 3.2;
    fill(C.soft); stroke(C.border); doc.roundedRect(14, y, 182, generatorHeight, 2.5, 2.5, "FD");
    label("EMPRESA GERADORA / UNIDADE", 20, y + 6, C.primary, 6.3);
    ink(C.ink); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text(fit(generatorName, 170), 20, y + 11.5);
    ink(C.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text(generatorLines, 20, y + 16, { lineHeightFactor: 1.25 });
    return y + generatorHeight + 6;
  };
  const printableBranchIds = branchIds.length ? branchIds : ["__matriz__"];
  for (const [index, id] of printableBranchIds.entries()) {
    const pageBranch = id === "__matriz__" ? null : branch(id) ?? null;
    let y = await drawHeader(pageBranch, index);
    const branchPlacements = id === "__matriz__" ? pdfPlacements.filter((item) => !item.branch_id) : pdfPlacements.filter((item) => item.branch_id === id);
    const branchMoves = id === "__matriz__" ? confirmedMovements.filter((item) => !item.branch_id) : confirmedMovements.filter((item) => item.branch_id === id);
    const treatmentByResidue = branchMoves.reduce<Record<string, { residueId: string; weight: number; value: number }>>((acc, item) => {
      const rate = Number(item.treatment_rate || 0);
      const key = `${item.waste_residue_id || "sem-residuo"}:${rate}`;
      acc[key] = acc[key] || { residueId: item.waste_residue_id || "sem-residuo", weight: 0, value: 0 };
      acc[key].weight += Number(item.weight_kg || 0);
      acc[key].value += Number(item.weight_kg || 0) * rate;
      return acc;
    }, {});
    const items = [
      ...branchPlacements.map((item) => ({
        name: `Locação · ${equipmentName(equipment.find((entry) => entry.id === item.equipment_id))}`,
        type: "Equipamento",
        quantity: `${number(Number(item.quantity))} un.`,
        unitValue: Number(item.monthly_rental_rate || 0),
        value: Number(item.quantity) * Number(item.monthly_rental_rate || 0),
      })),
      ...branchMoves.filter((item) => Number(item.removed_quantity || 0) > 0).map((item) => ({
        name: `Troca · ${equipmentName(equipment.find((entry) => entry.id === item.equipment_id || ""))}`,
        type: item.replacement_equipment_id ? `Entrada: ${equipmentName(equipment.find((entry) => entry.id === item.replacement_equipment_id || ""))}` : "Troca",
        quantity: `${number(Number(item.removed_quantity))} un.`,
        unitValue: Number(item.exchange_rate || 0),
        value: Number(item.removed_quantity || 0) * Number(item.exchange_rate || 0),
      })),
      ...Object.values(treatmentByResidue).filter((item) => item.weight > 0).map((item) => ({
        name: residues.find((entry) => entry.id === item.residueId)?.name || "Tratamento de resíduos",
        type: "Resíduo",
        quantity: `${number(item.weight)} kg`,
        unitValue: item.weight ? item.value / item.weight : 0,
        value: item.value,
      })),
      ...(index === 0
        ? pdfServices.map((item) => ({
            name: services.find((entry) => entry.id === item.waste_service_id)?.name || "Serviço",
            type: "Serviço terceirizado",
            quantity: `${number(Number(item.quantity || 1))} un.`,
            unitValue: Number(item.unit_amount ?? item.amount ?? 0),
            value: Number(item.amount || 0),
          }))
        : []),
    ];
    const observations = [
      ...branchPlacements.filter((item) => item.observation?.trim()).map((item) => ({
        label: `Locação · ${equipmentName(equipment.find((entry) => entry.id === item.equipment_id))}`,
        text: item.observation!.trim(),
      })),
      ...branchMoves.filter((item) => item.observation?.trim()).map((item) => ({
        label: `Movimentação${item.service_order ? ` · OS ${item.service_order}` : ""}`,
        text: item.observation!.trim(),
      })),
      ...(index === 0 ? pdfServices.filter((item) => item.observation?.trim()).map((item) => ({
        label: `Serviço · ${services.find((entry) => entry.id === item.waste_service_id)?.name || "Serviço"}`,
        text: item.observation!.trim(),
      })) : []),
    ];
    const drawContinuationTitle = (title: string) => {
      fill(C.deep); doc.roundedRect(14, 10, 182, 8, 2, 2, "F");
      label(title, 20, 15.3, [255, 255, 255], 7);
    };
    const drawItemsHeader = () => {
      fill(C.deep); doc.roundedRect(14, y, 182, 9, 2, 2, "F");
      label("ITEM", 20, y + 5.9, [255, 255, 255], 6.6);
      label("TIPO", 78, y + 5.9, [255, 255, 255], 6.6);
      label("QTD.", 118, y + 5.9, [255, 255, 255], 6.6);
      label("VALOR UNIT.", 146, y + 5.9, [255, 255, 255], 6.6);
      label("TOTAL", 190, y + 5.9, [255, 255, 255], 6.6, "right");
      y += 9;
    };
    drawItemsHeader();
    if (!items.length) {
      ink(C.muted); doc.setFont("helvetica", "italic"); doc.setFontSize(7.6);
      doc.text("Nenhum item lançado para esta unidade no período.", 105, y + 7, { align: "center" });
      y += 11;
    }
    // Nomes longos de equipamento quebram em até duas linhas em vez de serem cortados.
    const wrap = (text: string, width: number, size: number) => {
      doc.setFontSize(size);
      const lines: string[] = doc.splitTextToSize(text, width);
      return lines.length > 2 ? [lines[0], fit(lines.slice(1).join(" "), width)] : lines;
    };
    items.forEach((item, itemIndex) => {
      doc.setFont("helvetica", "normal");
      const nameLines = wrap(item.name, 55, 7.6);
      const typeLines = wrap(item.type, 37, 7);
      const rowHeight = Math.max(nameLines.length, typeLines.length) > 1 ? 12.5 : 9;
      if (y + rowHeight > 266) {
        doc.addPage();
        drawContinuationTitle(`CONTINUAÇÃO · BOLETIM ${printableBulletinNumber} · ITENS`);
        y = 23;
        drawItemsHeader();
      }
      if (itemIndex % 2 === 1) { fill(C.soft); doc.rect(14, y, 182, rowHeight, "F"); }
      stroke(C.border); doc.setLineWidth(0.2); doc.line(14, y + rowHeight, 196, y + rowHeight);
      const firstLine = (lines: string[]) => y + rowHeight / 2 + 1.2 - (lines.length - 1) * 1.6;
      const valueY = y + rowHeight / 2 + 1.2;
      ink(C.ink); doc.setFont("helvetica", "normal"); doc.setFontSize(7.6);
      doc.text(nameLines, 20, firstLine(nameLines), { lineHeightFactor: 1.2 });
      ink(C.muted); doc.setFontSize(7);
      doc.text(typeLines, 78, firstLine(typeLines), { lineHeightFactor: 1.25 });
      doc.setFontSize(7.4);
      doc.text(item.quantity, 118, valueY);
      doc.text(money(item.unitValue), 146, valueY);
      ink(C.ink); doc.setFont("helvetica", "bold");
      doc.text(money(item.value), 190, valueY, { align: "right" });
      y += rowHeight;
    });
    const branchTotal = items.reduce((sum, item) => sum + item.value, 0);
    if (observations.length) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.2);
      const observationLines = observations.flatMap((item) => doc.splitTextToSize(`${item.label}: ${item.text}`, 166));
      const observationHeight = 10 + observationLines.length * 3.6;
      y += 5;
      // As observações só mudam de página quando não cabem; o total quebra separadamente.
      if (y + observationHeight > 272) {
        doc.addPage();
        y = 23;
        drawContinuationTitle(`CONTINUAÇÃO · BOLETIM ${printableBulletinNumber} · OBSERVAÇÕES E TOTAL`);
      }
      doc.setFillColor(255, 250, 235); doc.setDrawColor(240, 205, 120); doc.setLineWidth(0.3);
      doc.roundedRect(14, y, 182, observationHeight, 2.5, 2.5, "FD");
      label("OBSERVAÇÕES", 20, y + 6, [161, 98, 7], 6.6);
      doc.setTextColor(79, 67, 36); doc.setFont("helvetica", "normal"); doc.setFontSize(7.2);
      doc.text(observationLines, 20, y + 11.5, { lineHeightFactor: 1.2 });
      y += observationHeight;
    }
    y += 7;
    if (y + 22 > 272) {
      doc.addPage();
      drawContinuationTitle(`CONTINUAÇÃO · BOLETIM ${printableBulletinNumber} · TOTAL`);
      y = 23;
    }
    ink(C.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(7.4);
    doc.text(`${items.length} ${items.length === 1 ? "item lançado" : "itens lançados"}`, 20, y + 11.5);
    fill(C.deep); doc.roundedRect(116, y, 80, 20, 3, 3, "F");
    fill(C.amber); doc.roundedRect(116, y + 5, 1.6, 10, 0.8, 0.8, "F");
    label("TOTAL DO DEMONSTRATIVO", 122, y + 7, C.onDeep, 6.4);
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text(money(branchTotal), 190, y + 15.5, { align: "right" });
  }
  // Rodapé em todas as páginas, com numeração.
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    stroke(C.border); doc.setLineWidth(0.3); doc.line(14, 279, 196, 279);
    fill(C.primary); doc.circle(15.2, 284.1, 1.1, "F");
    ink(C.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(7.2);
    doc.text("Jacoby Soluções Ambientais · Soluções que respeitam o meio ambiente.", 18.5, 285);
    doc.text(`Boletim ${printableBulletinNumber} · Página ${page} de ${totalPages}`, 196, 285, { align: "right" });
  }
  const fileName = bulletinPdfFileName(printableBulletinNumber, pdfClientName);
  return { fileName, blob: doc.output("blob") as Blob };
}
