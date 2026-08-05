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

async function getPosition(
  type: PositionType,
  code: string
): Promise<{ id: string; code: string; name: string }> {
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

async function findProfile(email: string) {
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

async function ensureOperator(
  type: PositionType,
  number: number
) {
  const padded = String(number).padStart(2, "0");
  const code = type === "cassa" ? `CASSA${padded}` : `STAND${padded}`;
  const email =
    type === "cassa"
      ? `cassa${padded}@operatori.indivino2026.it`
      : `stand${padded}@operatori.indivino2026.it`;

  const firstName = type === "cassa" ? "Cassa" : "Stand";
  const lastName = padded;
  const role = type;
  const position = await getPosition(type, code);

  let profile = await findProfile(email);

  if (profile) {
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({
        first_name: firstName,
        last_name: lastName,
        role,
        active: true
      })
      .eq("id", profile.id);

    if (updateError) throw updateError;

    await assignPosition(profile.id, type, position.id);

    return {
      created: false,
      email,
      password: null,
      role,
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
        cognome: lastName
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
      role,
      active: true
    })
    .eq("id", created.user.id);

  if (profileError) throw profileError;

  await assignPosition(created.user.id, type, position.id);

  return {
    created: true,
    email,
    password,
    role,
    position_code: code,
    position_name: position.name
  };
}

async function generateStructure() {
  const credentials = [];

  // CASSA01 è già l'amministratore principale.
  for (let number = 2; number <= 20; number += 1) {
    credentials.push(await ensureOperator("cassa", number));
  }

  for (let number = 1; number <= 15; number += 1) {
    credentials.push(await ensureOperator("stand", number));
  }

  return {
    credentials,
    created_count: credentials.filter((item) => item.created).length,
    existing_count: credentials.filter((item) => !item.created).length
  };
}

async function resetPassword(userId: string) {
  if (!userId) {
    throw new Error("Identificativo operatore mancante.");
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
    throw new Error("Operatore non trovato.");
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

    if (action === "generate_structure") {
      return response(await generateStructure());
    }

    if (action === "reset_password") {
      return response(await resetPassword(String(body?.user_id || "")));
    }

    return response({ error: "Azione non riconosciuta." }, 400);
  } catch (error) {
    console.error(error);
    return response(
      { error: error instanceof Error ? error.message : "Errore inatteso." },
      400
    );
  }
});
