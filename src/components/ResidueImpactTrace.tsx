import { Button } from "@/components/ui/button";
import {
  commissionTraceSources,
  financialImpactUrl,
  impactCategoryNames,
  impactTraceCycles,
} from "@/lib/map-impact-trace";
import type { MapDetail, MapResidue } from "@/lib/residue-map";
import { ArrowRight, ExternalLink, Pencil } from "lucide-react";
type Setting = MapDetail["settings"][number] | MapDetail["templates"][number];
type Rate = MapDetail["rates"][number] | MapDetail["templateRates"][number];
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 4,
  }).format(value);
export function ResidueImpactTrace({
  clientId,
  clientName,
  branchId,
  equipmentId,
  residue,
  residues,
  detail,
  companyName,
  canEdit,
  onEditSetting,
  onEditRate,
  onOpen,
}: {
  clientId: string;
  clientName: string;
  branchId: string | null;
  equipmentId?: string;
  residue?: MapResidue;
  residues: MapResidue[];
  detail?: MapDetail;
  companyName: (id?: string) => string;
  canEdit: boolean;
  onEditSetting: (item: Setting, template?: boolean) => void;
  onEditRate: (item: Rate, template?: boolean) => void;
  onOpen: (url: string, title: string) => void;
}) {
  if (!detail) return <p>Carregando as conexões…</p>;
  const cycles = impactTraceCycles(clientId, branchId, residue, detail, equipmentId);
  function settingCard(setting: Setting, template: boolean, cycleResidueIds?: Set<string>) {
    const cycleNames = new Set(
      residues
        .filter((r) => cycleResidueIds?.has(r.id))
        .map((r) => r.name.toLocaleLowerCase("pt-BR")),
    );
    const rates = template
      ? detail!.templateRates.filter(
          (r) =>
            r.commission_template_id === setting.id &&
            (!cycleResidueIds || cycleNames.has(r.residue_name.toLocaleLowerCase("pt-BR"))) &&
            (!residue ||
              r.residue_name.toLocaleLowerCase("pt-BR") ===
                residue.name.toLocaleLowerCase("pt-BR")),
        )
      : detail!.rates.filter(
          (r) =>
            r.commission_setting_id === setting.id &&
            (!cycleResidueIds || cycleResidueIds.has(r.waste_residue_id)) &&
            (!residue || r.waste_residue_id === residue.id),
        );
    return (
      <div key={setting.id} className="space-y-3 rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{companyName(setting.outsourced_company_id)}</p>
            <p className="text-xs text-muted-foreground">
              {template
                ? "Modelo compartilhado da terceirizada"
                : "Configuração específica deste cliente"}{" "}
              · {setting.active ? "ativa" : "desativada"}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!canEdit}
            onClick={() => onEditSetting(setting, template)}
          >
            <Pencil className="mr-1 h-3 w-3" />
            Editar percentuais
          </Button>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Locação</dt>
            <dd className="font-semibold">{setting.rental_commission_rate}%</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Troca</dt>
            <dd className="font-semibold">{setting.exchange_commission_rate}%</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Abatimento</dt>
            <dd className="font-semibold">{setting.tax_withholding_rate}%</dd>
          </div>
        </dl>
        {rates.map((rate) => (
          <div
            key={rate.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm"
          >
            <div>
              <p className="font-medium">
                {"residue_name" in rate
                  ? rate.residue_name
                  : residues.find((r) => r.id === rate.waste_residue_id)?.name ||
                    "Resíduo não disponível"}
              </p>
              <p className="text-xs text-muted-foreground">
                Terceirizada: {money(Number(rate.outsourced_treatment_rate))}/kg · Jacoby:{" "}
                {rate.jacoby_treatment_rate == null
                  ? "automático / fallback"
                  : `${money(Number(rate.jacoby_treatment_rate))}/kg`}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!canEdit}
              onClick={() => onEditRate(rate, template)}
            >
              Editar regra
            </Button>
          </div>
        ))}
        <p className="break-all text-[11px] text-muted-foreground">
          ID da configuração: {setting.id}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-primary/5 p-4">
        <h3 className="text-xl font-semibold">Da configuração ao resultado</h3>
        <p className="mt-2 text-sm">
          {clientName}
          {residue ? ` · ${residue.name}` : " · visão do cliente"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          À esquerda, a configuração referenciada pelo cálculo do BM. À direita, o acordo registrado
          no faturamento. O percentual ou valor final do repasse pode ser próprio do lançamento e é
          editado na tela de faturamento.
        </p>
      </div>
      {!cycles.length && (
        <div className="rounded-xl border p-5">
          <p>Nenhum BM ligado a esta seleção foi encontrado.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            As configurações atuais do cliente continuam disponíveis abaixo, mesmo sem lançamentos.
          </p>
        </div>
      )}
      {cycles.map((cycle) => {
        const sources = commissionTraceSources(cycle.id, detail);
        const tracking = detail.tracking.filter((t) => t.cycle_id === cycle.id);
        const commissions = detail.commissions.filter((c) => c.cycle_id === cycle.id);
        const cycleResidueIds = new Set(
          [
            ...commissions,
            ...detail.movements.filter((m) => m.cycle_id === cycle.id),
            ...detail.placements.filter((p) => p.cycle_id === cycle.id),
          ]
            .map((item) => item.waste_residue_id)
            .filter((id): id is string => Boolean(id)),
        );
        const bmParams = new URLSearchParams({
          cliente: clientId,
          boletim: cycle.id,
          patio: cycle.branch_id || "__matriz__",
          subaba: "movimentos",
        });
        if (cycle.period_start) bmParams.set("inicio", cycle.period_start);
        if (cycle.period_end) bmParams.set("fim", cycle.period_end);
        return (
          <section key={cycle.id} className="overflow-hidden rounded-xl border">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-4">
              <div>
                <h4 className="text-lg font-semibold">
                  BM #{String(cycle.bulletin_number).padStart(3, "0")} ·{" "}
                  {cycle.status === "closed" ? "Finalizado" : "Em edição"}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {cycle.outsourced_company_id
                    ? companyName(cycle.outsourced_company_id)
                    : "Jacoby"}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  onOpen(
                    `/portal/residuos?aba=faturamento2#${bmParams}`,
                    `BM #${cycle.bulletin_number}`,
                  )
                }
              >
                Abrir este BM
              </Button>
            </div>
            <div className="grid gap-5 p-4 xl:grid-cols-2">
              <div className="space-y-3">
                <h5 className="flex items-center gap-2 font-semibold">
                  1. Origem do cálculo <ArrowRight className="h-4 w-4" />
                </h5>
                {sources.settings.map((s) => settingCard(s, false, cycleResidueIds))}
                {sources.templates.map((s) => settingCard(s, true, cycleResidueIds))}
                {!sources.settings.length && !sources.templates.length && (
                  <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                    {commissions.length
                      ? "Este registro não informa um ID de configuração acessível. Não atribuímos uma origem por semelhança de nomes."
                      : "Não há cálculo automático de comissão registrado neste BM para rastrear até uma configuração."}
                  </p>
                )}
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Valores registrados no cálculo do BM ({commissions.length})
                  </summary>
                  <div className="mt-3 space-y-2">
                    {commissions.map((c) => (
                      <p key={c.id} className="rounded bg-muted p-2 text-sm">
                        {impactCategoryNames[c.source_type || ""] || "Comissão"} ·{" "}
                        {c.source_type === "treatment"
                          ? `${money(Number(c.commission_rate || 0))}/kg`
                          : `${c.commission_rate ?? "—"}%`}{" "}
                        · Comissão: {money(Number(c.net_commission_amount))}
                      </p>
                    ))}
                  </div>
                </details>
                <p className="text-xs text-muted-foreground">
                  Os percentuais acima são os atuais do cadastro referenciado. Os valores
                  registrados no BM mostram o cálculo salvo. Alterar a configuração pode recalcular
                  comissões conforme as regras do sistema.
                </p>
              </div>
              <div className="space-y-3">
                <h5 className="font-semibold">2. Onde aparece no faturamento</h5>
                {tracking.map((t) => (
                  <div
                    key={t.id}
                    className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-4"
                  >
                    <p className="font-semibold">
                      {impactCategoryNames[t.category] || t.category} ·{" "}
                      {t.source_key === "jacoby" ? "Jacoby" : companyName(t.source_key)}
                    </p>
                    <p className="text-sm">
                      Origem do repasse final: <strong>acordo deste lançamento</strong>.
                    </p>
                    <p className="text-lg font-semibold">
                      {t.rule_type === "percent"
                        ? `${t.rule_value}% sobre o líquido da NF`
                        : `Valor acordado: ${money(Number(t.rule_value || 0))}`}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Líquido da NF:{" "}
                      {t.net_invoice_amount == null
                        ? "não informado"
                        : money(Number(t.net_invoice_amount))}{" "}
                      · Repasse salvo: {money(Number(t.commission_amount || 0))}
                    </p>
                    <p className="text-xs">
                      NF: {t.invoice_number || "não informada"}. Este lançamento pertence ao BM e à
                      categoria; pode reunir mais de um resíduo.
                    </p>
                    <Button
                      onClick={() =>
                        onOpen(
                          financialImpactUrl(cycle.id, t.category, t.source_key),
                          `BM #${cycle.bulletin_number} · ${impactCategoryNames[t.category] || t.category}`,
                        )
                      }
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Ver e editar este repasse
                    </Button>
                  </div>
                ))}
                {!tracking.length && (
                  <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                    Nenhum acordo de repasse foi salvo neste BM. Abra o faturamento deste boletim
                    para conferir os lançamentos disponíveis.
                  </p>
                )}
                <Button
                  variant="outline"
                  onClick={() =>
                    onOpen(
                      financialImpactUrl(cycle.id),
                      `Faturamento do BM #${cycle.bulletin_number}`,
                    )
                  }
                >
                  Abrir somente o faturamento deste BM
                </Button>
              </div>
            </div>
          </section>
        );
      })}
      <details className="rounded-xl border p-4" open={!cycles.length}>
        <summary className="cursor-pointer font-semibold">Configurações atuais do cliente</summary>
        <p className="my-3 text-sm text-muted-foreground">
          Cadastro atual, separado das referências históricas dos BMs acima.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {detail.settings
            .filter((s) => s.client_id === clientId)
            .map((s) => settingCard(s, false))}
        </div>
        {!detail.settings.some((s) => s.client_id === clientId) && (
          <p className="text-sm text-muted-foreground">
            Este cliente não tem configuração específica cadastrada. Modelos das terceirizadas são
            identificados pelas referências de cada BM, quando existentes.
          </p>
        )}
      </details>
    </div>
  );
}
