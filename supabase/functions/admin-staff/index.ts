import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variabili Supabase mancanti.");
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders
  });
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function generatePassword(length = 14) {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercase = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "!@#$%";
  const all = uppercase + lowercase + numbers + symbols;

  const randomChar = (chars: string) => {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return chars[array[0] % chars.length];
  };

  const chars = [
    randomChar(uppercase),
    randomChar(lowercase),
    randomChar(numbers),
    randomChar(symbols)
  ];

  while (chars.length < length) {
    chars.push(randomChar(all));
  }

  for (let index = chars.length - 1; index > 0; index -= 1) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const swapIndex = array[0] % (index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }

  return chars.join("");
}

function generateBadgeCode() {
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return `IV26-${random}`;
}

async function requireAdmin(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw new Error("Sessione amministratore mancante.");
  }

  const {
    data: { user },
    error: userError
  } = await adminClient.auth.getUser(token);

  if (userError || !user) {
    throw new Error("Sessione non valida.");
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile ||
    profile.role !== "admin" ||
    profile.active !== true
  ) {
    throw new Error("Permesso negato: amministratore richiesto.");
  }

  return user;
}

type PositionType = "cassa" | "stand";

async function getPosition(type: PositionType, code: string) {
  const table = type === "cassa" ? "cashier_stations" : "stands";

  const { data, error } = await adminClient
    .from(table)
    .select("id, code, name")
    .eq("code", code)
    .eq("active", true)
    .single();

  if (error || !data) {
    throw new Error(`Postazione ${code} non trovata.`);
  }

  return data;
}

async function findProfileByEmail(email: string) {
  const { data, error } = await adminClient
    .from("profiles")
    .select("id, email, role, active")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function assignPosition(
  userId: string,
  type: PositionType,
  positionId: string
) {
  if (type === "cassa") {
    const { error } = await adminClient
      .from("cashier_operators")
      .upsert(
        {
          user_id: userId,
          cashier_station_id: positionId,
          active: true
        },
        { onConflict: "user_id" }
      );

    if (error) throw error;

    await adminClient
      .from("stand_operators")
      .delete()
      .eq("user_id", userId);
  } else {
    const { error } = await adminClient
      .from("stand_operators")
      .upsert(
        {
          user_id: userId,
          stand_id: positionId,
          active: true
        },
        { onConflict: "user_id" }
      );

    if (error) throw error;

    await adminClient
      .from("cashier_operators")
      .delete()
      .eq("user_id", userId);
  }
}

async function ensureOperator(type: PositionType, number: number) {
  if (!["cassa", "stand"].includes(type)) {
    throw new Error("Tipo operatore non valido.");
  }

  if (!Number.isInteger(number)) {
    throw new Error("Numero postazione non valido.");
  }

  if (type === "cassa" && (number < 2 || number > 20)) {
    throw new Error("Le casse generabili sono Cassa 02–20.");
  }

  if (type === "stand" && (number < 1 || number > 15)) {
    throw new Error("Gli stand generabili sono Stand 01–15.");
  }

  const padded = String(number).padStart(2, "0");
  const code = type === "cassa" ? `CASSA${padded}` : `STAND${padded}`;
  const email =
    type === "cassa"
      ? `cassa${padded}@operatori.indivino2026.it`
      : `stand${padded}@operatori.indivino2026.it`;

  const firstName = type === "cassa" ? "Cassa" : "Stand";
  const lastName = padded;
  const position = await getPosition(type, code);

  const profile = await findProfileByEmail(email);

  if (profile) {
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({
        first_name: firstName,
        last_name: lastName,
        role: type,
        active: true,
        customer_source: "staff",
        contact_email: null,
        badge_code: null
      })
      .eq("id", profile.id);

    if (updateError) throw updateError;

    await assignPosition(profile.id, type, position.id);

    return {
      created: false,
      email,
      password: null,
      role: type,
      position_code: code,
      position_name: position.name
    };
  }

  const password = generatePassword();

  const { data: created, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nome: firstName,
        cognome: lastName,
        account_type: "staff"
      }
    });

  if (createError || !created.user) {
    throw createError || new Error(`Creazione fallita per ${email}.`);
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      role: type,
      active: true,
      customer_source: "staff",
      contact_email: null,
      badge_code: null
    })
    .eq("id", created.user.id);

  if (profileError) throw profileError;

  await assignPosition(created.user.id, type, position.id);

  return {
    created: true,
    email,
    password,
    role: type,
    position_code: code,
    position_name: position.name
  };
}

async function createCustomer(body: Record<string, unknown>) {
  const firstName = String(body.first_name || "").trim();
  const lastName = String(body.last_name || "").trim();
  const contactEmail = normalizeEmail(body.email);

  if (!firstName || !lastName) {
    throw new Error("Nome e cognome sono obbligatori.");
  }

  if (firstName.length > 80 || lastName.length > 80) {
    throw new Error("Nome o cognome troppo lungo.");
  }

  if (contactEmail) {
    const { data: duplicate, error: duplicateError } = await adminClient
      .from("profiles")
      .select("id, first_name, last_name, contact_email, email")
      .or(`contact_email.eq.${contactEmail},email.eq.${contactEmail}`)
      .maybeSingle();

    if (duplicateError) throw duplicateError;

    if (duplicate) {
      throw new Error(
        `Email già presente per ${duplicate.first_name} ${duplicate.last_name}. Cerca il cliente esistente.`
      );
    }
  }

  let badgeCode = generateBadgeCode();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: existingCode, error } = await adminClient
      .from("profiles")
      .select("id")
      .eq("badge_code", badgeCode)
      .maybeSingle();

    if (error) throw error;
    if (!existingCode) break;

    badgeCode = generateBadgeCode();
  }

  const authEmail = contactEmail ||
    `badge.${badgeCode.toLowerCase().replaceAll("-", "")}@badge.indivino2026.local`;
  const password = generatePassword();

  const { data: created, error: createError } =
    await adminClient.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: {
        nome: firstName,
        cognome: lastName,
        account_type: "cliente",
        customer_source: "badge",
        contact_email: contactEmail || ""
      }
    });

  if (createError || !created.user) {
    throw createError || new Error("Creazione cliente non riuscita.");
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      role: "cliente",
      active: true,
      contact_email: contactEmail || null,
      customer_source: "badge",
      badge_code: badgeCode
    })
    .eq("id", created.user.id);

  if (profileError) throw profileError;

  const { data: wallet, error: walletError } = await adminClient
    .from("wallets")
    .select("id, qr_token, balance_cents, blocked")
    .eq("user_id", created.user.id)
    .single();

  if (walletError || !wallet) {
    throw walletError || new Error("Portafoglio non creato.");
  }

  return {
    customer: {
      user_id: created.user.id,
      first_name: firstName,
      last_name: lastName,
      auth_email: authEmail,
      contact_email: contactEmail || null,
      customer_source: "badge",
      badge_code: badgeCode,
      wallet_id: wallet.id,
      qr_token: wallet.qr_token,
      balance_cents: wallet.balance_cents,
      blocked: wallet.blocked,
      active: true,
      created_at: new Date().toISOString(),
      password
    }
  };
}

async function resetPassword(userId: string) {
  if (!userId) {
    throw new Error("Identificativo utente mancante.");
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select(`
      id,
      email,
      role,
      first_name,
      last_name,
      cashier_operators (
        cashier_stations (
          name
        )
      ),
      stand_operators (
        stands (
          name
        )
      )
    `)
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    throw new Error("Utente non trovato.");
  }

  const password = generatePassword();

  const { error } = await adminClient.auth.admin.updateUserById(
    userId,
    { password }
  );

  if (error) throw error;

  const cashierName =
    profile.cashier_operators?.[0]?.cashier_stations?.name;
  const standName =
    profile.stand_operators?.[0]?.stands?.name;

  return {
    email: profile.email,
    password,
    role: profile.role,
    position_name:
      cashierName ||
      standName ||
      `${profile.first_name} ${profile.last_name}`
  };
}


async function deleteCustomer(userId: string) {
  if (!userId) {
    throw new Error("Identificativo cliente mancante.");
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, first_name, last_name, active, deleted_at")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    throw new Error("Cliente non trovato.");
  }

  if (profile.role !== "cliente") {
    throw new Error("È possibile eliminare soltanto clienti.");
  }

  if (profile.deleted_at) {
    return {
      mode: "anonymized",
      already_deleted: true
    };
  }

  const { data: wallet, error: walletError } = await adminClient
    .from("wallets")
    .select("id, balance_cents")
    .eq("user_id", userId)
    .single();

  if (walletError || !wallet) {
    throw new Error("Portafoglio cliente non trovato.");
  }

  if (Number(wallet.balance_cents) !== 0) {
    throw new Error(
      "Il cliente non può essere eliminato finché il saldo non è zero."
    );
  }

  const [
    transactionResult,
    stripeResult
  ] = await Promise.all([
    adminClient
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("wallet_id", wallet.id),
    adminClient
      .from("stripe_payments")
      .select("id", { count: "exact", head: true })
      .eq("wallet_id", wallet.id)
  ]);

  if (transactionResult.error) {
    throw transactionResult.error;
  }

  if (stripeResult.error) {
    throw stripeResult.error;
  }

  const hasFinancialHistory =
    Number(transactionResult.count || 0) > 0 ||
    Number(stripeResult.count || 0) > 0;

  if (!hasFinancialHistory) {
    const { error: deleteError } =
      await adminClient.auth.admin.deleteUser(
        userId,
        false
      );

    if (deleteError) throw deleteError;

    return {
      mode: "deleted",
      user_id: userId
    };
  }

  const { error: anonymizeError } = await adminClient.rpc(
    "admin_anonymize_customer",
    {
      p_user_id: userId
    }
  );

  if (anonymizeError) throw anonymizeError;

  const { error: softDeleteError } =
    await adminClient.auth.admin.deleteUser(
      userId,
      true
    );

  if (softDeleteError) {
    console.warn(
      "Profilo anonimizzato, soft delete Auth non riuscita:",
      softDeleteError
    );
  }

  return {
    mode: "anonymized",
    user_id: userId
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return response({ ok: true });
  }

  if (req.method !== "POST") {
    return response({ error: "Metodo non consentito." }, 405);
  }

  try {
    await requireAdmin(req);
    const body = await req.json();
    const action = String(body?.action || "");

    if (action === "health") {
      return response({ ok: true });
    }

    if (action === "ensure_operator") {
      return response(
        await ensureOperator(
          String(body.type || "") as PositionType,
          Number(body.number)
        )
      );
    }

    if (action === "create_customer") {
      return response(await createCustomer(body));
    }

    if (action === "reset_password") {
      return response(await resetPassword(String(body?.user_id || "")));
    }

    if (action === "delete_customer") {
      return response(
        await deleteCustomer(String(body?.user_id || ""))
      );
    }

    return response({ error: "Azione non riconosciuta." }, 400);
  } catch (error) {
    console.error("admin-staff:", error);

    return response(
      {
        error: error instanceof Error
          ? error.message
          : "Errore inatteso."
      },
      400
    );
  }
});
