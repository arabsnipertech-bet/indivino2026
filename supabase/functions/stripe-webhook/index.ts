import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

if (
  !supabaseUrl ||
  !serviceRoleKey ||
  !stripeSecretKey ||
  !webhookSecret
) {
  throw new Error("Configurazione webhook Stripe incompleta.");
}

const stripe = new Stripe(stripeSecretKey);
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

function paymentIntentId(
  value: string | Stripe.PaymentIntent | null
) {
  if (!value) return "";
  return typeof value === "string" ? value : value.id;
}

async function applyPaidSession(
  session: Stripe.Checkout.Session,
  eventId: string
) {
  if (session.payment_status !== "paid") {
    return;
  }

  const amount = Number(session.amount_total || 0);
  const currency = String(session.currency || "").toLowerCase();
  const intentId = paymentIntentId(session.payment_intent);

  const { error } = await adminClient.rpc(
    "stripe_apply_paid_checkout",
    {
      p_checkout_session_id: session.id,
      p_payment_intent_id: intentId,
      p_stripe_event_id: eventId,
      p_amount_cents: amount,
      p_currency: currency
    }
  );

  if (error) throw error;
}

async function markSession(
  session: Stripe.Checkout.Session,
  status: "expired" | "failed",
  eventId: string
) {
  const { error } = await adminClient.rpc(
    "stripe_mark_checkout_status",
    {
      p_checkout_session_id: session.id,
      p_status: status,
      p_stripe_event_id: eventId
    }
  );

  if (error) throw error;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Metodo non consentito.", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Firma Stripe mancante.", { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (error) {
    console.error("Firma webhook non valida:", error);
    return new Response("Firma Stripe non valida.", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        await applyPaidSession(session, event.id);
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        await markSession(session, "expired", event.id);
        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await markSession(session, "failed", event.id);
        break;
      }

      default:
        break;
    }

    return Response.json({
      received: true,
      event_id: event.id
    });
  } catch (error) {
    console.error("Errore elaborazione webhook:", error);

    return Response.json(
      {
        received: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore elaborazione webhook."
      },
      { status: 500 }
    );
  }
});
