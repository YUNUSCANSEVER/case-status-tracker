import { requireSupabase } from "./supabase.js";
import { fetchCaseStatusFromProvider } from "./uscisProvider.js";

export function isActiveStatus(status) {
  const lower = String(status || "").toLowerCase();

  return (
    !lower.includes("approved") &&
    !lower.includes("produced") &&
    !lower.includes("denied") &&
    !lower.includes("rejected")
  );
}

export function normalizeCasePayload(payload = {}) {
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

export function toFrontendCase(row, history = []) {
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

export function toFrontendHistory(row) {
  return {
    id: row.id,
    date: row.event_date,
    title: row.title,
    text: row.description || "",
    source: row.source,
  };
}

export async function listCases() {
  const db = requireSupabase();

  const { data: caseRows, error: caseError } = await db
    .from("cases")
    .select("*")
    .order("created_at", { ascending: false });

  if (caseError) throw caseError;

  const caseIds = caseRows.map((row) => row.id);
  let historyRows = [];

  if (caseIds.length > 0) {
    const { data, error } = await db
      .from("status_history")
      .select("*")
      .in("case_id", caseIds)
      .order("event_date", { ascending: false });

    if (error) throw error;
    historyRows = data || [];
  }

  const historyByCaseId = historyRows.reduce((acc, row) => {
    if (!acc[row.case_id]) acc[row.case_id] = [];
    acc[row.case_id].push(row);
    return acc;
  }, {});

  return caseRows.map((row) => toFrontendCase(row, historyByCaseId[row.id] || []));
}

export async function createCase(payload) {
  const db = requireSupabase();
  const normalized = normalizeCasePayload(payload);

  validateCasePayload(normalized);

  const { data: insertedCase, error } = await db
    .from("cases")
    .insert({
      ...normalized,
      last_checked_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) throw error;

  await createHistoryEvent(insertedCase.id, {
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

export async function updateCase(id, payload) {
  const db = requireSupabase();
  const normalized = normalizeCasePayload(payload);

  validateCasePayload(normalized);

  const { data: currentCase, error: currentError } = await db
    .from("cases")
    .select("*")
    .eq("id", id)
    .single();

  if (currentError) throw currentError;

  const { data: updatedCase, error } = await db
    .from("cases")
    .update(normalized)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  const statusChanged =
    currentCase.status !== normalized.status || currentCase.status_date !== normalized.status_date;

  await createHistoryEvent(id, {
    title: statusChanged ? "Case Status Updated Manually" : "Case Details Edited",
    description: statusChanged
      ? `Status manually updated to "${normalized.status}".`
      : "Tracking details were edited manually.",
    source: "manual",
  });

  return toFrontendCase(updatedCase);
}

export async function deleteCase(id) {
  const db = requireSupabase();
  const { error } = await db.from("cases").delete().eq("id", id);
  if (error) throw error;

  return { id };
}

export async function createCasesBulk(casesPayload = []) {
  const created = [];
  const errors = [];

  for (const [index, payload] of casesPayload.entries()) {
    try {
      const createdCase = await createCase(payload);
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

export async function checkCaseById(id, options = {}) {
  const db = requireSupabase();

  const { data: currentCase, error: currentError } = await db
    .from("cases")
    .select("*")
    .eq("id", id)
    .single();

  if (currentError) throw currentError;

  return checkAndUpdateCase(currentCase, options);
}

export async function checkActiveCases(options = {}) {
  const db = requireSupabase();

  const { data: caseRows, error } = await db.from("cases").select("*");

  if (error) throw error;

  const activeCases = caseRows.filter((row) => isActiveStatus(row.status));
  const results = [];
  const errors = [];

  for (const caseRow of activeCases) {
    try {
      const result = await checkAndUpdateCase(caseRow, {
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

async function checkAndUpdateCase(caseRow, options = {}) {
  const db = requireSupabase();
  const providerResult = await fetchCaseStatusFromProvider(caseRow.receipt_number);
  const checkTime = new Date().toISOString();
  const nextStatus = providerResult.status || caseRow.status;
  const nextStatusDate = providerResult.statusDate || new Date().toISOString().slice(0, 10);
  const statusChanged = caseRow.status !== nextStatus || caseRow.status_date !== nextStatusDate;

  const { data: updatedCase, error: updateError } = await db
    .from("cases")
    .update({
      status: nextStatus,
      status_date: nextStatusDate,
      last_checked_at: checkTime,
    })
    .eq("id", caseRow.id)
    .select("*")
    .single();

  if (updateError) throw updateError;

  if (statusChanged || options.recordNoChange) {
    await createHistoryEvent(caseRow.id, {
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

async function createHistoryEvent(caseId, event) {
  const db = requireSupabase();

  const { error } = await db.from("status_history").insert({
    case_id: caseId,
    event_date: event.eventDate || new Date().toISOString(),
    title: event.title,
    description: event.description || "",
    source: event.source || "manual",
  });

  if (error) throw error;
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
