function hasUscisCredentials() {
  return Boolean(
    process.env.USCIS_CLIENT_ID &&
      process.env.USCIS_CLIENT_SECRET &&
      process.env.USCIS_TOKEN_URL &&
      process.env.USCIS_CASE_STATUS_URL
  );
}

export function getProviderMode() {
  return hasUscisCredentials() ? "uscis-api" : "demo";
}

export async function fetchCaseStatusFromProvider(receiptNumber) {
  const normalizedReceipt = String(receiptNumber || "").trim().toUpperCase();

  if (!/^[A-Z]{3}[0-9]{10}$/.test(normalizedReceipt)) {
    const error = new Error("Invalid receipt number format.");
    error.statusCode = 400;
    throw error;
  }

  if (!hasUscisCredentials()) {
    return createDemoStatus(normalizedReceipt);
  }

  const accessToken = await fetchUscisAccessToken();
  const liveStatus = await fetchUscisCaseStatus(normalizedReceipt, accessToken);

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

async function fetchUscisAccessToken() {
  const response = await fetch(process.env.USCIS_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.USCIS_CLIENT_ID,
      client_secret: process.env.USCIS_CLIENT_SECRET,
      scope: process.env.USCIS_SCOPE || "",
    }),
  });

  const tokenResponseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `USCIS token request failed with ${response.status}: ${safeErrorText(tokenResponseText)}`
    );
  }

  let tokenResponse;

  try {
    tokenResponse = JSON.parse(tokenResponseText);
  } catch (error) {
    throw new Error("USCIS token response was not valid JSON.");
  }

  if (!tokenResponse.access_token) {
    throw new Error(
      `USCIS token response did not include access_token: ${safeErrorText(tokenResponseText)}`
    );
  }

  return tokenResponse.access_token;
}

async function fetchUscisCaseStatus(receiptNumber, accessToken) {
  const baseUrl = process.env.USCIS_CASE_STATUS_URL.replace(/\/$/, "");
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

  try {
    return JSON.parse(responseText);
  } catch (error) {
    throw new Error("USCIS case status response was not valid JSON.");
  }
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

  // USCIS sandbox examples use MM-DD-YYYY HH:mm:ss.
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
