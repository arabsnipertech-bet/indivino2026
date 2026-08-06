import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const siteUrl = (
  Deno.env.get("SITE_URL") ||
  "https://indivino2026.arabsnipertech.workers.dev"
).replace(/\/+$/, "");

if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) {
  throw new Error("Configurazione server Stripe incompleta.");
}

const stripe = new Stripe(stripeSecretKey);
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const allowedAmounts = new Set([1000, 2000, 3000, 5000]);

const corsHeaders = {
  "Access-Control-Allow-Origin": siteUrl,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function requireCustomer(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw new Error("Sessione cliente mancante.");
  }

  const {
    data: { user },
    error: userError
  } = await adminClient.auth.getUser(token);

  if (userError || !user) {
    throw new Error("Sessione cliente non valida.");
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, first_name, last_name, email, contact_email, role, active, deleted_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(
      `Errore lettura profilo cliente: ${profileError.message}`
    );
  }

  if (!profile) {
    throw new Error(
      `Profilo non trovato per l’account ${user.email || user.id}.`
    );
  }

  if (profile.role !== "cliente") {
    throw new Error(
      `Ruolo account non valido: risulta “${profile.role}” invece di “cliente”.`
    );
  }

  if (profile.active !== true || profile.deleted_at) {
    throw new Error("Account cliente presente ma disattivato.");
  }

  const { data: wallet, error: walletError } = await adminClient
    .from("wallets")
    .select("id, blocked")
    .eq("user_id", user.id)
    .single();

  if (walletError || !wallet) {
    throw new Error("Portafoglio non disponibile.");
  }

  if (wallet.blocked) {
    throw new Error("Portafoglio bloccato.");
  }

  return { user, profile, wallet };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return response({ ok: true });
  }

  if (req.method !== "POST") {
    return response({ error: "Metodo non consentito." }, 405);
  }

  try {
    const origin = req.headers.get("Origin");

    if (origin && origin !== siteUrl) {
      return response({ error: "Origine non autorizzata." }, 403);
    }

    const { user, profile, wallet } = await requireCustomer(req);
    const body = await req.json();

    const amountCents = Number(body?.amount_cents);
    const requestId = String(body?.request_id || "").trim();

    if (!allowedAmounts.has(amountCents)) {
      throw new Error("Importo non consentito.");
    }

    if (!isUuid(requestId)) {
      throw new Error("Codice richiesta non valido.");
    }

    const { data: existing, error: existingError } = await adminClient
      .from("stripe_payments")
      .select("checkout_url, status, user_id, amount_cents")
      .eq("idempotency_key", requestId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      if (
        existing.user_id !== user.id ||
        Number(existing.amount_cents) !== amountCents
      ) {
        throw new Error("Codice richiesta già utilizzato.");
      }

      if (existing.status === "pending" && existing.checkout_url) {
        return response({
          url: existing.checkout_url,
          reused: true
        });
      }

      throw new Error("Questa richiesta di pagamento è già conclusa.");
    }

    const divini = amountCents / 200;
    const realEmail = String(
      profile.contact_email || user.email || ""
    ).trim();

    const metadata = {
      indivino_user_id: user.id,
      indivino_wallet_id: wallet.id,
      indivino_amount_cents: String(amountCents),
      indivino_idempotency_key: requestId
    };

    const sessionParameters: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      locale: "it",
      client_reference_id: user.id,
      success_url:
        `${siteUrl}/cliente?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cliente?stripe=cancelled`,
      payment_method_types: ["card"],
      metadata,
      payment_intent_data: {
        description: `Ricarica portafoglio Indivino 2026 - ${divini} Divini`,
        metadata
      },
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: amountCents,
            product_data: {
              name: `Ricarica Indivino 2026 - ${divini} Divini`,
              description:
                "Credito digitale utilizzabile durante l’evento Indivino 2026"
            }
          },
          quantity: 1
        }
      ]
    };

    if (
      realEmail &&
      !realEmail.endsWith("@badge.indivino2026.local")
    ) {
      sessionParameters.customer_email = realEmail;
      sessionParameters.payment_intent_data = {
        ...sessionParameters.payment_intent_data,
        receipt_email: realEmail
      };
    }

    const session = await stripe.checkout.sessions.create(
      sessionParameters,
      { idempotencyKey: requestId }
    );

    if (!session.url) {
      throw new Error("Stripe non ha generato la pagina di pagamento.");
    }

    const { error: registerError } = await adminClient.rpc(
      "stripe_register_checkout",
      {
        p_user_id: user.id,
        p_wallet_id: wallet.id,
        p_checkout_session_id: session.id,
        p_checkout_url: session.url,
        p_amount_cents: amountCents,
        p_currency: "eur",
        p_idempotency_key: requestId
      }
    );

    if (registerError) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch {
        // La sessione scadrà comunque automaticamente.
      }

      throw registerError;
    }

    return response({
      url: session.url,
      session_id: session.id,
      amount_cents: amountCents
    });
  } catch (error) {
    console.error("stripe-create-checkout:", error);

    return response(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossibile creare il pagamento Stripe."
      },
      400
    );
  }
});
