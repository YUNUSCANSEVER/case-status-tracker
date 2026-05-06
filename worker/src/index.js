const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runAutoCheck(env));
  },
};

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }), request, env);
  }

  try {
    if (url.pathname === "/" || url.pathname === "/api/health") {
      return jsonResponse(await getHealth(env), request, env);
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const body = await readJson(request);
      const username = String(body.username || "");
      const password = String(body.password || "");

      if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
        return jsonResponse({ error: "Invalid username or password." }, request, env, 401);
      }

      const token = await createToken({ sub: username }, env.SESSION_SECRET);

      return jsonResponse({ token }, request, env);
    }

    if (url.pathname === "/api/auth/me") {
      const auth = await authenticateRequest(request, env, { optional: true });
      return jsonResponse({ authenticated: Boolean(auth), user: auth?.sub || null }, request, env);
    }

    const auth = await authenticateRequest(request, env);
    if (!auth) {
      return jsonResponse({ error: "Unauthorized." }, request, env, 401);
    }

    if (url.pathname === "/api/cases" && request.method === "GET") {
      return jsonResponse({ cases: await listCases(env) }, request, env);
    }

    if (url.pathname === "/api/cases" && request.method === "POST") {
      const body = await readJson(request);
      return jsonResponse({ case: await createCase(body, env) }, request, env, 201);
    }

    if (url.pathname === "/api/cases/bulk" && request.method === "POST") {
      const body = await readJson(request);
      const result = await createCasesBulk(body.cases || [], env);
      return jsonResponse(result, request, env, 201);
    }

    if (url.pathname === "/api/cases/check-active" && request.method === "POST") {
      return jsonResponse(
        await checkActiveCases(env, { recordNoChange: true, source: "manual-check-all" }),
        request,
        env
      );
    }

    const caseCheckMatch = url.pathname.match(/^\/api\/cases\/([^/]+)\/check$/);
    if (caseCheckMatch && request.method === "POST") {
      return jsonResponse(
        await checkCaseById(caseCheckMatch[1], env, {
          recordNoChange: true,
          source: "manual-check",
        }),
        request,
        env
      );
    }

    const caseIdMatch = url.pathname.match(/^\/api\/cases\/([^/]+)$/);
    if (caseIdMatch && request.method === "PUT") {
      const body = await readJson(request);
      return jsonResponse({ case: await updateCase(caseIdMatch[1], body, env) }, request, env);
    }

    if (caseIdMatch && request.method === "DELETE") {
      await deleteCase(caseIdMatch[1], env);
      return jsonResponse({ id: caseIdMatch[1] }, request, env);
    }

    return jsonResponse({ error: "Not found." }, request, env, 404);
  } catch (error) {
    console.error(error);
    return jsonResponse(
      { error: error.message || "Internal server error." },
      request,
      env,
      error.statusCode || 500
    );
  }
}

async function getHealth(env) {
  let database = "not-configured";

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await supabaseRequest(env, "/cases?select=id&limit=1", { method: "GET" });
      database = "ok";
    } catch (error) {
      database = "error";
    }
  }

  return {
    status: "ok",
    service: "Case Status Tracker Worker API",
    database,
    providerMode: getProviderMode(env),
    autoCheckEnabled: true,
    autoCheckCron: "*/15 * * * *",
    time: new Date().toISOString(),
  };
}

async function runAutoCheck(env) {
  console.log(`[worker-cron] started at ${new Date().toISOString()}`);

  const result = await checkActiveCases(env, {
    recordNoChange: false,
    source: "cloudflare-cron",
  });

  console.log(
    `[worker-cron] checked=${result.checked}, updated=${result.updated}, errors=${result.errors.length}`
  );

  return result;
}

function getAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");

  const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    env.FRONTEND_ORIGIN,
  ].filter(Boolean);

  if (origin && allowedOrigins.includes(origin)) return origin;

  // Non-browser requests like direct browser GET /api/health often do not have Origin.
  return env.FRONTEND_ORIGIN || "http://localhost:5173";
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", getAllowedOrigin(request, env));
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponse(payload, request, env, status = 200) {
  return withCors(
    new Response(JSON.stringify(payload), {
      status,
      headers: JSON_HEADERS,
    }),
    request,
    env
  );
}

async function readJson(request) {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

async function authenticateRequest(request, env, options = {}) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    if (options.optional) return null;
    return null;
  }

  try {
    return verifyToken(token, env.SESSION_SECRET);
  } catch (error) {
    if (options.optional) return null;
    return null;
  }
}

async function createToken(payload, secret) {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const body = base64UrlEncode(
    JSON.stringify({
      ...payload,
      exp: expiresAt,
    })
  );

  const signature = await sign(body, secret);
  return `${body}.${signature}`;
}

async function verifyToken(token, secret) {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("Invalid token.");

  const expectedSignature = await sign(body, secret);
  if (signature !== expectedSignature) throw new Error("Invalid token signature.");

  const payload = JSON.parse(base64UrlDecode(body));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired.");
  }

  return payload;
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );

  return base64UrlEncodeBytes(new Uint8Array(signatureBuffer));
}

function base64UrlEncode(value) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return atob(padded);
}

async function supabaseRequest(env, path, options = {}) {
  const url = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase request failed with ${response.status}: ${safeErrorText(responseText)}`);
  }

  if (!responseText) return null;
  return JSON.parse(responseText);
}

function normalizeCasePayload(payload = {}) {
  return {
    case_label: String(payload.caseLabel || payload.case_label || "").trim(),
    receipt_number: String(payload.receiptNumber || payload.receipt_number || "")
      .trim()
      .toUpperCase()
      .replace(/\s/g, ""),
    form_type: payload.formType || payload.form_type || "Other",
    category: payload.category || "Other",
    service_center: payload.serviceCenter || payload.service_center || "Not selected",
    filing_date: payload.filingDate || payload.filing_date || null,
    priority_date: payload.priorityDate || payload.priority_date || null,
    status: payload.status || "Case Was Received",
    status_date: payload.statusDate || payload.status_date || new Date().toISOString().slice(0, 10),
    notes: payload.notes || "",
  };
}

function validateCasePayload(payload) {
  if (!payload.case_label) {
    const error = new Error("caseLabel is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!/^[A-Z]{3}[0-9]{10}$/.test(payload.receipt_number)) {
    const error = new Error("Receipt number must be 3 letters followed by 10 digits.");
    error.statusCode = 400;
    throw error;
  }
}

function toFrontendCase(row, history = []) {
  return {
    id: row.id,
    caseLabel: row.case_label,
    receiptNumber: row.receipt_number,
    formType: row.form_type,
    category: row.category,
    serviceCenter: row.service_center,
    filingDate: row.filing_date || "",
    priorityDate: row.priority_date || "",
    status: row.status,
    statusDate: row.status_date || "",
    lastCheckedAt: row.last_checked_at || "",
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: history.map(toFrontendHistory),
  };
}

function toFrontendHistory(row) {
  return {
    id: row.id,
    date: row.event_date,
    title: row.title,
    text: row.description || "",
    source: row.source,
  };
}

async function listCases(env) {
  const caseRows = await supabaseRequest(env, "/cases?select=*&order=created_at.desc", {
    method: "GET",
  });

  const caseIds = caseRows.map((row) => row.id);
  let historyRows = [];

  if (caseIds.length > 0) {
    historyRows = await supabaseRequest(
      env,
      `/status_history?select=*&case_id=in.(${caseIds.join(",")})&order=event_date.desc`,
      { method: "GET" }
    );
  }

  const historyByCaseId = historyRows.reduce((acc, row) => {
    if (!acc[row.case_id]) acc[row.case_id] = [];
    acc[row.case_id].push(row);
    return acc;
  }, {});

  return caseRows.map((row) => toFrontendCase(row, historyByCaseId[row.id] || []));
}

async function createCase(payload, env) {
  const normalized = normalizeCasePayload(payload);
  validateCasePayload(normalized);

  const insertedRows = await supabaseRequest(env, "/cases?select=*", {
    method: "POST",
    body: JSON.stringify({
      ...normalized,
      last_checked_at: new Date().toISOString(),
    }),
  });

  const insertedCase = insertedRows[0];

  await createHistoryEvent(insertedCase.id, env, {
    title: insertedCase.status,
    description: "Case added to tracker.",
    source: "manual",
    eventDate: insertedCase.status_date || new Date().toISOString(),
  });

  return toFrontendCase(insertedCase, [
    {
      id: "created",
      event_date: insertedCase.status_date || new Date().toISOString(),
      title: insertedCase.status,
      description: "Case added to tracker.",
      source: "manual",
    },
  ]);
}

async function updateCase(id, payload, env) {
  const normalized = normalizeCasePayload(payload);
  validateCasePayload(normalized);

  const currentRows = await supabaseRequest(env, `/cases?select=*&id=eq.${encodeURIComponent(id)}`, {
    method: "GET",
  });

  const currentCase = currentRows[0];
  if (!currentCase) {
    const error = new Error("Case not found.");
    error.statusCode = 404;
    throw error;
  }

  const updatedRows = await supabaseRequest(env, `/cases?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: "PATCH",
    body: JSON.stringify(normalized),
  });

  const updatedCase = updatedRows[0];

  const statusChanged =
    currentCase.status !== normalized.status || currentCase.status_date !== normalized.status_date;

  await createHistoryEvent(id, env, {
    title: statusChanged ? "Case Status Updated Manually" : "Case Details Edited",
    description: statusChanged
      ? `Status manually updated to "${normalized.status}".`
      : "Tracking details were edited manually.",
    source: "manual",
  });

  return toFrontendCase(updatedCase);
}

async function deleteCase(id, env) {
  await supabaseRequest(env, `/cases?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  return { id };
}

async function createCasesBulk(casesPayload = [], env) {
  const created = [];
  const errors = [];

  for (const [index, payload] of casesPayload.entries()) {
    try {
      const createdCase = await createCase(payload, env);
      created.push(createdCase);
    } catch (error) {
      errors.push({
        index,
        receiptNumber: payload.receiptNumber || payload.receipt_number,
        error: error.message,
      });
    }
  }

  return { created, errors };
}

async function checkCaseById(id, env, options = {}) {
  const currentRows = await supabaseRequest(env, `/cases?select=*&id=eq.${encodeURIComponent(id)}`, {
    method: "GET",
  });

  const currentCase = currentRows[0];
  if (!currentCase) {
    const error = new Error("Case not found.");
    error.statusCode = 404;
    throw error;
  }

  return checkAndUpdateCase(currentCase, env, options);
}

async function checkActiveCases(env, options = {}) {
  const caseRows = await supabaseRequest(env, "/cases?select=*", { method: "GET" });
  const activeCases = caseRows.filter((row) => isActiveStatus(row.status));
  const results = [];
  const errors = [];

  for (const caseRow of activeCases) {
    try {
      const result = await checkAndUpdateCase(caseRow, env, {
        recordNoChange: Boolean(options.recordNoChange),
        source: options.source || "auto-check",
      });
      results.push(result);
    } catch (error) {
      errors.push({
        id: caseRow.id,
        receiptNumber: caseRow.receipt_number,
        error: error.message,
      });
    }
  }

  return {
    checked: activeCases.length,
    updated: results.filter((result) => result.statusChanged).length,
    results,
    errors,
  };
}

function isActiveStatus(status) {
  const lower = String(status || "").toLowerCase();

  return (
    !lower.includes("approved") &&
    !lower.includes("produced") &&
    !lower.includes("denied") &&
    !lower.includes("rejected")
  );
}

async function checkAndUpdateCase(caseRow, env, options = {}) {
  const providerResult = await fetchCaseStatusFromProvider(caseRow.receipt_number, env);
  const checkTime = new Date().toISOString();
  const nextStatus = providerResult.status || caseRow.status;
  const nextStatusDate = providerResult.statusDate || new Date().toISOString().slice(0, 10);
  const statusChanged = caseRow.status !== nextStatus || caseRow.status_date !== nextStatusDate;

  const updatedRows = await supabaseRequest(env, `/cases?id=eq.${encodeURIComponent(caseRow.id)}&select=*`, {
    method: "PATCH",
    body: JSON.stringify({
      status: nextStatus,
      status_date: nextStatusDate,
      last_checked_at: checkTime,
    }),
  });

  const updatedCase = updatedRows[0];

  if (statusChanged || options.recordNoChange) {
    await createHistoryEvent(caseRow.id, env, {
      title: statusChanged ? "Status Updated" : "Status Checked",
      description: statusChanged
        ? `Status changed to "${nextStatus}". ${providerResult.description}`
        : `No status change found. ${providerResult.description}`,
      source: options.source || providerResult.source || "backend-check",
      eventDate: checkTime,
    });
  }

  return {
    case: toFrontendCase(updatedCase),
    providerResult,
    statusChanged,
  };
}

async function createHistoryEvent(caseId, env, event) {
  await supabaseRequest(env, "/status_history", {
    method: "POST",
    body: JSON.stringify({
      case_id: caseId,
      event_date: event.eventDate || new Date().toISOString(),
      title: event.title,
      description: event.description || "",
      source: event.source || "manual",
    }),
  });
}

function getProviderMode(env) {
  return env.USCIS_CLIENT_ID &&
    env.USCIS_CLIENT_SECRET &&
    env.USCIS_TOKEN_URL &&
    env.USCIS_CASE_STATUS_URL
    ? "uscis-api"
    : "demo";
}

async function fetchCaseStatusFromProvider(receiptNumber, env) {
  const normalizedReceipt = String(receiptNumber || "").trim().toUpperCase();

  if (!/^[A-Z]{3}[0-9]{10}$/.test(normalizedReceipt)) {
    const error = new Error("Invalid receipt number format.");
    error.statusCode = 400;
    throw error;
  }

  if (getProviderMode(env) !== "uscis-api") {
    return createDemoStatus(normalizedReceipt);
  }

  const accessToken = await fetchUscisAccessToken(env);
  const liveStatus = await fetchUscisCaseStatus(normalizedReceipt, accessToken, env);

  return normalizeUscisStatusResponse(liveStatus, normalizedReceipt);
}

function createDemoStatus(receiptNumber) {
  const demoStatuses = [
    {
      status: "Case Was Received",
      description: "Demo backend response. USCIS credentials are not configured yet.",
    },
    {
      status: "Case Is Being Actively Reviewed",
      description: "Demo backend response. Configure USCIS API credentials for live data.",
    },
    {
      status: "Biometrics Appointment Was Scheduled",
      description: "Demo backend response. This is not a live USCIS result.",
    },
    {
      status: "Request for Evidence Was Sent",
      description: "Demo backend response. This is not a live USCIS result.",
    },
    {
      status: "Interview Was Scheduled",
      description: "Demo backend response. This is not a live USCIS result.",
    },
  ];

  const index =
    receiptNumber.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    demoStatuses.length;

  return {
    receiptNumber,
    status: demoStatuses[index].status,
    statusDate: new Date().toISOString().slice(0, 10),
    description: demoStatuses[index].description,
    source: "demo-backend",
    raw: null,
  };
}

async function fetchUscisAccessToken(env) {
  const response = await fetch(env.USCIS_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.USCIS_CLIENT_ID,
      client_secret: env.USCIS_CLIENT_SECRET,
      scope: env.USCIS_SCOPE || "",
    }),
  });

  const tokenResponseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `USCIS token request failed with ${response.status}: ${safeErrorText(tokenResponseText)}`
    );
  }

  const tokenResponse = JSON.parse(tokenResponseText);

  if (!tokenResponse.access_token) {
    throw new Error(
      `USCIS token response did not include access_token: ${safeErrorText(tokenResponseText)}`
    );
  }

  return tokenResponse.access_token;
}

async function fetchUscisCaseStatus(receiptNumber, accessToken, env) {
  const baseUrl = env.USCIS_CASE_STATUS_URL.replace(/\/$/, "");
  const url = `${baseUrl}/${encodeURIComponent(receiptNumber)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `USCIS case status request failed with ${response.status}: ${safeErrorText(responseText)}`
    );
  }

  return JSON.parse(responseText);
}

function normalizeUscisStatusResponse(raw, receiptNumber) {
  const caseStatus =
    raw.case_status ||
    raw.caseStatus ||
    raw.data?.case_status ||
    raw.data?.caseStatus ||
    raw.data ||
    raw;

  const status =
    caseStatus.current_case_status_text_en ||
    caseStatus.currentCaseStatusTextEn ||
    caseStatus.current_case_status_text ||
    caseStatus.status ||
    caseStatus.caseStatus ||
    raw.status ||
    raw.caseStatus ||
    "Status returned by USCIS";

  const description =
    caseStatus.current_case_status_desc_en ||
    caseStatus.currentCaseStatusDescEn ||
    caseStatus.current_case_status_desc ||
    caseStatus.description ||
    caseStatus.message ||
    raw.description ||
    raw.message ||
    "Live USCIS response received.";

  const statusDateRaw =
    caseStatus.modifiedDate ||
    caseStatus.modified_date ||
    caseStatus.statusDate ||
    caseStatus.lastUpdated ||
    raw.statusDate ||
    raw.lastUpdated ||
    new Date().toISOString().slice(0, 10);

  return {
    receiptNumber: caseStatus.receiptNumber || caseStatus.receipt_number || receiptNumber,
    formType: caseStatus.formType || caseStatus.form_type || null,
    submittedDate: caseStatus.submittedDate || caseStatus.submitted_date || null,
    status,
    statusDate: toIsoDate(statusDateRaw),
    description: stripHtml(description),
    source: "uscis-api",
    raw,
  };
}

function toIsoDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);

  const stringValue = String(value);
  const match = stringValue.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (match) {
    const [, month, day, year] = match;
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(stringValue);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function safeErrorText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();

  if (!text) return "No response body.";

  return text.length > 700 ? `${text.slice(0, 700)}...` : text;
}
