import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Delivery = {
  id: string;
  cycle_id: string;
  residue_emission_id: string | null;
  recipient_email: string;
  status: "pending" | "failed";
  attempts: number;
  custom_message: string | null;
};

type Cycle = {
  id: string;
  client_id: string;
  branch_id: string | null;
  bulletin_number: number;
  period_start: string;
  period_end: string;
  client_portal_visible: boolean;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function retryDate(attempts: number) {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1) * 5);
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

export default {
  fetch: async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

    const authorization = request.headers.get("Authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sessão não encontrada." }, 401);

    const projectUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!projectUrl || !anonKey || !serviceRoleKey) return json({ error: "Supabase não configurado." }, 500);

    const authClient = createClient(projectUrl, anonKey, {
      global: { headers: { Authorization: authorization! } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Sessão inválida." }, 401);

    const { data: maySend, error: permissionError } = await authClient.rpc("has_app_permission", {
      required_permission: "billing",
    });
    if (permissionError || !maySend) return json({ error: "Acesso ao faturamento não autorizado." }, 403);

    let input: { cycleId?: string; residueEmissionId?: string; deliveryId?: string; previewOnly?: boolean; customMessage?: string } = {};
    try {
      input = await request.json();
    } catch {
      // Corpo vazio processa a fila vencida.
    }

    const admin = createClient(projectUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (input.previewOnly) {
      if (!input.cycleId) return json({ error: "Boletim não informado." }, 400);
      const { data: cycle, error: cycleError } = await admin
        .from("billing_v2_cycles")
        .select("client_id")
        .eq("id", input.cycleId)
        .single();
      if (cycleError || !cycle) return json({ error: "Boletim não encontrado." }, 404);
      const { data: links, error: linksError } = await admin
        .from("client_user_links")
        .select("user_id")
        .eq("client_id", cycle.client_id);
      if (linksError) return json({ error: linksError.message }, 500);
      const userIds = (links || []).map((item) => item.user_id);
      const recipients: string[] = [];
      for (const userId of userIds) {
        const { data: userData } = await admin.auth.admin.getUserById(userId);
        const email = userData.user?.email?.trim().toLowerCase();
        if (email && !recipients.includes(email)) recipients.push(email);
      }
      return json({ recipients });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const sender = Deno.env.get("BILLING_EMAIL_FROM");
    const replyTo = Deno.env.get("BILLING_EMAIL_REPLY_TO");
    const appUrl = (Deno.env.get("APP_PUBLIC_URL") || "https://gestao.jacobysolucoesambientais.com.br").replace(/\/$/, "");
    if (input.cycleId) {
      const { error: queueError } = await admin.rpc("queue_billing_portal_emails", {
        target_cycle_id: input.cycleId,
        target_residue_emission_id: input.residueEmissionId || null,
      });
      if (queueError) return json({ error: queueError.message }, 500);
      let messageUpdate = admin
        .from("billing_email_deliveries")
        .update({ custom_message: input.customMessage?.trim().slice(0, 2000) || null })
        .eq("cycle_id", input.cycleId)
        .in("status", ["pending", "failed"]);
      messageUpdate = input.residueEmissionId
        ? messageUpdate.eq("residue_emission_id", input.residueEmissionId)
        : messageUpdate.is("residue_emission_id", null);
      await messageUpdate;
    }

    if (!resendApiKey || !sender) {
      return json({
        configured: false,
        pending: true,
        message: "A publicação foi registrada e o e-mail aguardará a configuração do Resend.",
      }, 503);
    }

    let deliveriesQuery = admin
      .from("billing_email_deliveries")
      .select("id,cycle_id,residue_emission_id,recipient_email,status,attempts,custom_message")
      .in("status", ["pending", "failed"])
      .lte("next_attempt_at", new Date().toISOString())
      .lt("attempts", 5)
      .order("queued_at", { ascending: true })
      .limit(50);
    if (input.deliveryId) deliveriesQuery = deliveriesQuery.eq("id", input.deliveryId);
    if (input.cycleId) deliveriesQuery = deliveriesQuery.eq("cycle_id", input.cycleId);
    if (input.residueEmissionId) deliveriesQuery = deliveriesQuery.eq("residue_emission_id", input.residueEmissionId);

    const { data: pendingRows, error: deliveriesError } = await deliveriesQuery;
    if (deliveriesError) return json({ error: deliveriesError.message }, 500);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const delivery of (pendingRows || []) as Delivery[]) {
      const attemptNumber = delivery.attempts + 1;
      const { data: claimed } = await admin
        .from("billing_email_deliveries")
        .update({ status: "sending", attempts: attemptNumber, last_error: null })
        .eq("id", delivery.id)
        .in("status", ["pending", "failed"])
        .select("id")
        .maybeSingle();
      if (!claimed) {
        skipped += 1;
        continue;
      }

      try {
        const { data: cycleData, error: cycleError } = await admin
          .from("billing_v2_cycles")
          .select("id,client_id,branch_id,bulletin_number,period_start,period_end,client_portal_visible")
          .eq("id", delivery.cycle_id)
          .single();
        if (cycleError || !cycleData) throw cycleError ?? new Error("Boletim não encontrado.");
        const cycle = cycleData as Cycle;

        let displayNumber = String(cycle.bulletin_number).padStart(3, "0");
        let residueName = "";
        let visible = cycle.client_portal_visible;
        if (delivery.residue_emission_id) {
          const { data: emission, error: emissionError } = await admin
            .from("billing_v2_residue_emissions")
            .select("display_number,waste_residue_id,client_portal_visible")
            .eq("id", delivery.residue_emission_id)
            .single();
          if (emissionError || !emission) throw emissionError ?? new Error("Emissão por resíduo não encontrada.");
          displayNumber = emission.display_number;
          visible = emission.client_portal_visible;
          const { data: residue } = await admin.from("waste_residues").select("name").eq("id", emission.waste_residue_id).maybeSingle();
          residueName = residue?.name || "";
        }

        if (!visible) {
          await admin.from("billing_email_deliveries").update({ status: "cancelled", last_error: null }).eq("id", delivery.id);
          skipped += 1;
          continue;
        }

        const [{ data: client }, { data: branch }] = await Promise.all([
          admin.from("clients").select("name").eq("id", cycle.client_id).maybeSingle(),
          cycle.branch_id ? admin.from("client_branches").select("name").eq("id", cycle.branch_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);

        const clientName = client?.name || "Cliente";
        const branchName = branch?.name || "Matriz";
        const period = `${formatDate(cycle.period_start)} a ${formatDate(cycle.period_end)}`;
        const portalUrl = `${appUrl}/portal/boletins`;
        const subject = `BM #${displayNumber} disponível no Portal do Cliente`;
        const html = `
          <!doctype html>
          <html lang="pt-BR">
            <body style="margin:0;background:#f4f7f1;font-family:Arial,sans-serif;color:#304332">
              <div style="max-width:620px;margin:32px auto;background:#fff;border:1px solid #dfe8db;border-radius:14px;overflow:hidden">
                <div style="background:#2f7d2d;color:#fff;padding:22px 28px">
                  <div style="font-size:13px;letter-spacing:.05em;text-transform:uppercase">Jacoby Soluções Ambientais</div>
                  <h1 style="font-size:24px;margin:8px 0 0">Boletim de medição disponível</h1>
                </div>
                <div style="padding:28px">
                  <p style="margin-top:0">Olá,</p>
                  <p>O BM <strong>#${escapeHtml(displayNumber)}</strong> foi disponibilizado no Portal do Cliente.</p>
                  ${delivery.custom_message ? `<div style="margin:18px 0;border-left:4px solid #2f7d2d;background:#f7faf5;padding:14px 16px;white-space:pre-line">${escapeHtml(delivery.custom_message)}</div>` : ""}
                  <div style="background:#f7faf5;border-radius:10px;padding:16px 18px;line-height:1.7">
                    <div><strong>Cliente:</strong> ${escapeHtml(clientName)}</div>
                    <div><strong>Filial/pátio:</strong> ${escapeHtml(branchName)}</div>
                    <div><strong>Período:</strong> ${escapeHtml(period)}</div>
                    ${residueName ? `<div><strong>Resíduo:</strong> ${escapeHtml(residueName)}</div>` : ""}
                  </div>
                  <p style="margin:26px 0">
                    <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#2f7d2d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Visualizar BM no portal</a>
                  </p>
                  <p style="font-size:13px;color:#6a786a;margin-bottom:0">Este é um aviso automático. Para acessar o documento, utilize seu login do Portal do Cliente.</p>
                </div>
              </div>
            </body>
          </html>`;

        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: sender,
            to: [delivery.recipient_email],
            subject,
            html,
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
        });
        const providerBody = await resendResponse.json().catch(() => ({}));
        if (!resendResponse.ok) throw new Error(providerBody?.message || `Resend respondeu ${resendResponse.status}.`);

        await admin.from("billing_email_deliveries").update({
          status: "sent",
          provider_message_id: providerBody?.id || null,
          sent_at: new Date().toISOString(),
          last_error: null,
        }).eq("id", delivery.id);
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha desconhecida no envio.";
        await admin.from("billing_email_deliveries").update({
          status: "failed",
          last_error: message.slice(0, 1000),
          next_attempt_at: retryDate(attemptNumber),
        }).eq("id", delivery.id);
        failed += 1;
      }
    }

    return json({ configured: true, processed: (pendingRows || []).length, sent, failed, skipped });
  },
};
