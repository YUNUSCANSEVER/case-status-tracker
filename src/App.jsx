import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const CASES_STORAGE_KEY = "case-status-tracker-cases-v2";
const SETTINGS_STORAGE_KEY = "case-status-tracker-settings-worker-v1";
const AUTH_SESSION_KEY = "case-status-tracker-auth-token-v1";
const LAST_AUTO_CHECK_KEY = "case-status-tracker-last-auto-check-v1";
const AUTO_CHECK_INTERVAL_MINUTES = 15;
const AUTO_CHECK_INTERVAL_MS = AUTO_CHECK_INTERVAL_MINUTES * 60 * 1000;

const initialCases = [
  {
    id: 1,
    caseLabel: "Ahmet C.",
    formType: "I-485",
    receiptNumber: "IOE0912345678",
    filingDate: "2026-01-12",
    priorityDate: "2025-11-04",
    serviceCenter: "NBC",
    category: "Marriage-Based AOS",
    status: "Case Is Being Actively Reviewed",
    statusDate: "2026-05-02",
    lastCheckedAt: "2026-05-06",
    notes: "Biometrics completed. Monitor for interview notice.",
    history: [
      {
        date: "2026-05-02",
        title: "Case Is Being Actively Reviewed",
        text: "USCIS is actively reviewing the case.",
      },
      {
        date: "2026-03-18",
        title: "Biometrics Were Taken",
        text: "Fingerprint and photo appointment completed.",
      },
      {
        date: "2026-01-12",
        title: "Case Was Received",
        text: "USCIS received the application.",
      },
    ],
  },
  {
    id: 2,
    caseLabel: "Maria S.",
    formType: "I-765",
    receiptNumber: "MSC2490012882",
    filingDate: "2026-02-22",
    priorityDate: "",
    serviceCenter: "MSC",
    category: "Employment Authorization",
    status: "Card Was Produced",
    statusDate: "2026-05-04",
    lastCheckedAt: "2026-05-06",
    notes: "EAD approved. Confirm delivery tracking once available.",
    history: [
      {
        date: "2026-05-04",
        title: "Card Was Produced",
        text: "New card has been produced.",
      },
      {
        date: "2026-04-29",
        title: "Case Approved",
        text: "USCIS approved the employment authorization request.",
      },
      {
        date: "2026-02-22",
        title: "Case Was Received",
        text: "USCIS received the application.",
      },
    ],
  },
  {
    id: 3,
    caseLabel: "John D.",
    formType: "I-130",
    receiptNumber: "IOE0923456789",
    filingDate: "2025-09-08",
    priorityDate: "2025-09-08",
    serviceCenter: "Texas Service Center",
    category: "Immediate Relative Petition",
    status: "Request for Evidence Was Sent",
    statusDate: "2026-04-18",
    lastCheckedAt: "2026-05-06",
    notes: "RFE open. Status tracking only.",
    history: [
      {
        date: "2026-04-18",
        title: "Request for Evidence Was Sent",
        text: "USCIS mailed an RFE notice.",
      },
      {
        date: "2025-09-08",
        title: "Case Was Received",
        text: "Petition received by USCIS.",
      },
    ],
  },
  {
    id: 4,
    caseLabel: "Fatima A.",
    formType: "N-400",
    receiptNumber: "IOE0988812301",
    filingDate: "2025-12-01",
    priorityDate: "",
    serviceCenter: "Online Filing",
    category: "Naturalization",
    status: "Interview Was Scheduled",
    statusDate: "2026-05-01",
    lastCheckedAt: "2026-05-06",
    notes: "Interview scheduled.",
    history: [
      {
        date: "2026-05-01",
        title: "Interview Was Scheduled",
        text: "USCIS scheduled the naturalization interview.",
      },
      {
        date: "2026-01-10",
        title: "Biometrics Reuse Notice",
        text: "USCIS will reuse previous biometrics.",
      },
      {
        date: "2025-12-01",
        title: "Case Was Received",
        text: "Naturalization application received.",
      },
    ],
  },
];

const initialSettings = {
  workspaceName: "Case Status Tracker",
  workspaceSubtitle: "Private USCIS tracking dashboard",
  maskReceiptNumbers: true,
  defaultView: "dashboard",
  backendApiUrl: import.meta.env.VITE_BACKEND_API_URL || "https://case-status-tracker-api.casetrackerapp.workers.dev",
  liveStatusChecks: true,
  autoCheckEnabled: true,
  themeMode: "day",
  adminUsername: "",
  adminPassword: "",
};

const views = [
  { key: "dashboard", label: "Dashboard" },
  { key: "settings", label: "Settings" },
];

function createBlankCaseForm() {
  return {
    caseLabel: "",
    formType: "I-485",
    receiptNumber: "",
    filingDate: "",
    priorityDate: "",
    serviceCenter: "",
    category: "Marriage-Based AOS",
    status: "Case Was Received",
    statusDate: new Date().toISOString().slice(0, 10),
    notes: "",
  };
}

function loadArrayFromStorage(storageKey, fallbackValue) {
  try {
    const savedValue = window.localStorage.getItem(storageKey);
    if (!savedValue) return fallbackValue;

    const parsedValue = JSON.parse(savedValue);
    return Array.isArray(parsedValue) ? parsedValue : fallbackValue;
  } catch (error) {
    console.warn(`Could not load ${storageKey}.`, error);
    return fallbackValue;
  }
}

function loadObjectFromStorage(storageKey, fallbackValue) {
  try {
    const savedValue = window.localStorage.getItem(storageKey);
    if (!savedValue) return fallbackValue;

    const parsedValue = JSON.parse(savedValue);
    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
      return fallbackValue;
    }

    return { ...fallbackValue, ...parsedValue };
  } catch (error) {
    console.warn(`Could not load ${storageKey}.`, error);
    return fallbackValue;
  }
}

function formatDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function daysBetween(startDate, endDate = new Date()) {
  if (!startDate) return 0;

  const start = new Date(startDate);
  const difference = endDate.getTime() - start.getTime();

  return Math.max(0, Math.floor(difference / (1000 * 60 * 60 * 24)));
}

function isValidReceiptNumber(receiptNumber) {
  return /^[A-Z]{3}[0-9]{10}$/.test(String(receiptNumber || "").trim().toUpperCase());
}

function maskReceipt(receipt) {
  if (!receipt) return "";
  return `${receipt.slice(0, 5)}*****${receipt.slice(-3)}`;
}

function displayReceipt(receipt, shouldMask) {
  return shouldMask ? maskReceipt(receipt) : receipt;
}

function getShortDateTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getEventSourceLabel(source) {
  const sourceMap = {
    "manual": "Manual",
    "manual-check": "Manual Check",
    "manual-check-all": "Check All",
    "backend-cron": "Auto Check",
    "auto-check": "Auto Check",
    "uscis-api": "USCIS API",
    "demo-backend": "Demo Backend",
  };

  return sourceMap[source] || source || "Tracker";
}

function getStatusClass(status) {
  const lower = String(status || "").toLowerCase();

  if (lower.includes("approved") || lower.includes("produced")) return "approved";
  if (lower.includes("evidence") || lower.includes("rfe")) return "rfe";
  if (lower.includes("interview")) return "interview";
  if (lower.includes("biometric") || lower.includes("fingerprint")) return "biometric";
  if (lower.includes("review")) return "review";
  if (lower.includes("denied") || lower.includes("rejected") || lower.includes("reject")) return "denied";

  return "received";
}

function getStatusBucket(status) {
  const lower = String(status || "").toLowerCase();

  if (lower.includes("denied") || lower.includes("rejected") || lower.includes("reject")) {
    return "rejected";
  }

  if (lower.includes("approved") || lower.includes("produced") || lower.includes("card was")) {
    return "approved";
  }

  if (lower.includes("interview")) {
    return "interview";
  }

  if (lower.includes("evidence") || lower.includes("rfe")) {
    return "rfe";
  }

  if (lower.includes("biometric") || lower.includes("fingerprint")) {
    return "biometric";
  }

  return "received";
}

const statusCards = [
  {
    key: "total",
    label: "All Cases",
    helper: "All tracked receipts",
    className: "",
  },
  {
    key: "received",
    label: "Case Received",
    helper: "Receipt notice / received",
    className: "received",
  },
  {
    key: "biometric",
    label: "Biometric Scheduled",
    helper: "Biometric / fingerprint",
    className: "biometric",
  },
  {
    key: "rfe",
    label: "RFE",
    helper: "Evidence requested",
    className: "warning",
  },
  {
    key: "interview",
    label: "Interview Scheduled",
    helper: "Interview related status",
    className: "interview",
  },
  {
    key: "approved",
    label: "Approved / Card Produced",
    helper: "Approved or produced",
    className: "success",
  },
  {
    key: "rejected",
    label: "Rejected / Denied",
    helper: "Rejected or denied",
    className: "danger",
  },
];

function isActiveCase(status) {
  const lower = String(status || "").toLowerCase();
  return (
    !lower.includes("approved") &&
    !lower.includes("produced") &&
    !lower.includes("denied") &&
    !lower.includes("rejected")
  );
}

function escapeCsvValue(value) {
  const stringValue = String(value ?? "");

  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function BarRow({ label, value, max }) {
  const width = max > 0 ? `${Math.max((value / max) * 100, 8)}%` : "0%";

  return (
    <div className="bar-row">
      <div className="bar-row-top">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width }} />
      </div>
    </div>
  );
}

export default function App() {
  const initialLoadedCases = useMemo(
    () => loadArrayFromStorage(CASES_STORAGE_KEY, initialCases),
    []
  );
  const initialLoadedSettings = useMemo(
    () => loadObjectFromStorage(SETTINGS_STORAGE_KEY, initialSettings),
    []
  );

  const [cases, setCases] = useState(initialLoadedCases);
  const [settings, setSettings] = useState(initialLoadedSettings);
  const safeDefaultView = views.some((view) => view.key === initialLoadedSettings.defaultView)
    ? initialLoadedSettings.defaultView
    : "dashboard";
  const [activeView, setActiveView] = useState(safeDefaultView);
  const [authToken, setAuthToken] = useState(
    () => window.sessionStorage.getItem(AUTH_SESSION_KEY) || ""
  );
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(authToken));
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState(initialLoadedCases[0]?.id || 1);
  const [search, setSearch] = useState("");
  const [caseStatusFilter, setCaseStatusFilter] = useState("all");
  const [caseFormFilter, setCaseFormFilter] = useState("all");
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [caseForm, setCaseForm] = useState(createBlankCaseForm());
  const [isBulkCaseModalOpen, setIsBulkCaseModalOpen] = useState(false);
  const [bulkCaseText, setBulkCaseText] = useState("");
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [isCasesLoading, setIsCasesLoading] = useState(false);
  const [backendError, setBackendError] = useState("");
  const [backendHealth, setBackendHealth] = useState(null);
  const [toast, setToast] = useState(null);
  const [lastAutoCheckAt, setLastAutoCheckAt] = useState(
    () => window.localStorage.getItem(LAST_AUTO_CHECK_KEY) || ""
  );
  const backupInputRef = useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(CASES_STORAGE_KEY, JSON.stringify(cases));
    } catch (error) {
      console.warn("Could not save cases cache.", error);
    }
  }, [cases]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn("Could not save settings.", error);
    }
  }, [settings]);

  useEffect(() => {
    if (!isAuthenticated) return;

    loadBackendHealth();
    loadCasesFromBackend();
  }, [isAuthenticated, settings.backendApiUrl, authToken]);

  useEffect(() => {
    if (!isAuthenticated || !settings.autoCheckEnabled) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      refreshCasesFromBackend();
    }, AUTO_CHECK_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isAuthenticated, settings.autoCheckEnabled, settings.backendApiUrl, authToken]);

  const selectedCase = cases.find((item) => item.id === selectedCaseId) || cases[0];
  const today = new Date();

  const formTypes = useMemo(() => {
    return Array.from(new Set(cases.map((item) => item.formType))).sort();
  }, [cases]);

  const filteredCases = useMemo(() => {
    const query = search.toLowerCase().trim();

    return cases.filter((item) => {
      const matchesSearch =
        !query ||
        item.caseLabel.toLowerCase().includes(query) ||
        item.receiptNumber.toLowerCase().includes(query) ||
        item.formType.toLowerCase().includes(query) ||
        item.status.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query);

      const matchesStatus =
        caseStatusFilter === "all" ||
        (caseStatusFilter === "active" && isActiveCase(item.status)) ||
        getStatusBucket(item.status) === caseStatusFilter;

      const matchesForm = caseFormFilter === "all" || item.formType === caseFormFilter;

      return matchesSearch && matchesStatus && matchesForm;
    });
  }, [cases, search, caseStatusFilter, caseFormFilter]);

  const stats = useMemo(() => {
    const totals = {
      total: cases.length,
      received: 0,
      biometric: 0,
      rfe: 0,
      interview: 0,
      approved: 0,
      rejected: 0,
      active: cases.filter((item) => isActiveCase(item.status)).length,
      noUpdate90: cases.filter(
        (item) => isActiveCase(item.status) && daysBetween(item.statusDate, today) >= 90
      ).length,
    };

    cases.forEach((item) => {
      const bucket = getStatusBucket(item.status);
      totals[bucket] = (totals[bucket] || 0) + 1;
    });

    return totals;
  }, [cases]);

  const groupedByForm = useMemo(() => {
    const result = {};
    cases.forEach((item) => {
      result[item.formType] = (result[item.formType] || 0) + 1;
    });

    return Object.entries(result)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [cases]);

  const groupedByStatus = useMemo(() => {
    const result = {};
    const labelMap = {
      received: "Case Received",
      biometric: "Biometric Scheduled",
      rfe: "RFE",
      interview: "Interview Scheduled",
      approved: "Approved / Card Produced",
      rejected: "Rejected / Denied",
    };

    cases.forEach((item) => {
      const statusGroup = getStatusBucket(item.status);
      result[statusGroup] = (result[statusGroup] || 0) + 1;
    });

    return Object.entries(result)
      .map(([label, value]) => ({
        label: labelMap[label] || label,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [cases]);

  const agingBuckets = useMemo(() => {
    const buckets = {
      "0–30 days": 0,
      "31–90 days": 0,
      "91–180 days": 0,
      "181+ days": 0,
    };

    cases.forEach((item) => {
      const age = daysBetween(item.filingDate, today);
      if (age <= 30) buckets["0–30 days"] += 1;
      else if (age <= 90) buckets["31–90 days"] += 1;
      else if (age <= 180) buckets["91–180 days"] += 1;
      else buckets["181+ days"] += 1;
    });

    return Object.entries(buckets).map(([label, value]) => ({ label, value }));
  }, [cases]);

  const maxFormCount = Math.max(...groupedByForm.map((item) => item.value), 1);
  const maxStatusCount = Math.max(...groupedByStatus.map((item) => item.value), 1);
  const maxAgingCount = Math.max(...agingBuckets.map((item) => item.value), 1);

  const recentStatusEvents = useMemo(() => {
    return cases
      .flatMap((caseItem) =>
        (caseItem.history || []).map((event) => ({
          ...event,
          caseId: caseItem.id,
          caseLabel: caseItem.caseLabel,
          receiptNumber: caseItem.receiptNumber,
          formType: caseItem.formType,
          currentStatus: caseItem.status,
        }))
      )
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 8);
  }, [cases]);

  function showToast(type, title, message = "") {
    const id = Date.now();

    setToast({
      id,
      type,
      title,
      message,
    });

    window.setTimeout(() => {
      setToast((currentToast) => (currentToast?.id === id ? null : currentToast));
    }, type === "error" ? 9000 : 4500);
  }

  function handleLoginFormChange(event) {
    const { name, value } = event.target;

    setLoginForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setLoginError("");

    try {
      const response = await fetch(`${getBackendBaseUrl()}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(loginForm),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.token) {
        throw new Error(payload.error || "Invalid username or password.");
      }

      window.sessionStorage.setItem(AUTH_SESSION_KEY, payload.token);
      setAuthToken(payload.token);
      setIsAuthenticated(true);
      setLoginForm({ username: "", password: "" });
      setLoginError("");
    } catch (error) {
      console.warn(error);
      setLoginError(error.message || "Could not login.");
    }
  }

  function handleLogout() {
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
    setAuthToken("");
    setIsAuthenticated(false);
    setActiveView("dashboard");
  }

  function getBackendBaseUrl() {
    return settings.backendApiUrl.replace(/\/$/, "");
  }

  async function apiRequest(path, options = {}) {
    const token = window.sessionStorage.getItem(AUTH_SESSION_KEY) || authToken;

    const response = await fetch(`${getBackendBaseUrl()}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || `Backend returned ${response.status}`);
    }

    return payload;
  }

  async function loadBackendHealth() {
    try {
      const health = await apiRequest("/api/health");
      setBackendHealth(health);
      setBackendError("");
      return health;
    } catch (error) {
      console.warn(error);
      setBackendError(error.message || "Backend health check failed.");
      return null;
    }
  }

  async function loadCasesFromBackend(options = {}) {
    try {
      if (!options.silent) setIsCasesLoading(true);

      const payload = await apiRequest("/api/cases");
      const backendCases = payload.cases || [];

      setCases(backendCases);
      setSelectedCaseId((currentSelectedId) => {
        if (backendCases.some((caseItem) => caseItem.id === currentSelectedId)) {
          return currentSelectedId;
        }

        return backendCases[0]?.id || null;
      });
      setBackendError("");
      return backendCases;
    } catch (error) {
      console.warn(error);
      setBackendError(error.message || "Could not load cases from backend.");
      return [];
    } finally {
      if (!options.silent) setIsCasesLoading(false);
    }
  }

  async function refreshCasesFromBackend() {
    await loadBackendHealth();
    await loadCasesFromBackend({ silent: true });

    const checkTime = new Date().toISOString();
    setLastAutoCheckAt(checkTime);
    window.localStorage.setItem(LAST_AUTO_CHECK_KEY, checkTime);
  }

  function openAddCaseModal() {
    setModalMode("add");
    setCaseForm(createBlankCaseForm());
    setIsCaseModalOpen(true);
  }

  function openEditCaseModal() {
    if (!selectedCase) return;

    setModalMode("edit");
    setCaseForm({
      caseLabel: selectedCase.caseLabel || "",
      formType: selectedCase.formType || "I-485",
      receiptNumber: selectedCase.receiptNumber || "",
      filingDate: selectedCase.filingDate || "",
      priorityDate: selectedCase.priorityDate || "",
      serviceCenter: selectedCase.serviceCenter === "Not selected" ? "" : selectedCase.serviceCenter || "",
      category: selectedCase.category || "Marriage-Based AOS",
      status: selectedCase.status || "Case Was Received",
      statusDate: selectedCase.statusDate || new Date().toISOString().slice(0, 10),
      notes: selectedCase.notes || "",
    });
    setIsCaseModalOpen(true);
  }

  function closeCaseModal() {
    setIsCaseModalOpen(false);
    setCaseForm(createBlankCaseForm());
    setModalMode("add");
  }

  function openBulkCaseModal() {
    setBulkCaseText("");
    setIsBulkCaseModalOpen(true);
  }

  function closeBulkCaseModal() {
    setIsBulkCaseModalOpen(false);
    setBulkCaseText("");
  }

  async function handleCheckSelectedCase() {
    if (!selectedCase) return;

    try {
      const result = await apiRequest(`/api/cases/${selectedCase.id}/check`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      await loadCasesFromBackend({ silent: true });

      if (result.statusChanged) {
        showToast(
          "success",
          "Status updated",
          `${selectedCase.receiptNumber} was updated from USCIS.`
        );
        return;
      }

      showToast("info", "Status checked", `${selectedCase.receiptNumber} has no new update.`);
    } catch (error) {
      console.warn(error);
      showToast("error", "USCIS check failed", error.message || "Unknown error");
    }
  }

  async function handleCheckAllActiveCases() {
    const activeCases = cases.filter((caseItem) => isActiveCase(caseItem.status));

    if (activeCases.length === 0) {
      showToast("info", "No active cases", "There are no active cases to check.");
      return;
    }

    const confirmed = window.confirm(`Check status for ${activeCases.length} active case(s)?`);
    if (!confirmed) return;

    setIsCheckingAll(true);

    try {
      const result = await apiRequest("/api/cases/check-active", {
        method: "POST",
        body: JSON.stringify({}),
      });

      await loadCasesFromBackend({ silent: true });

      if (result.errors?.length) {
        showToast(
          "warning",
          "Check completed with errors",
          `${result.errors.length} case(s) failed. Check backend terminal for details.`
        );
        return;
      }

      showToast(
        "success",
        "Check completed",
        `Checked ${result.checked || activeCases.length} active case(s). Updated ${result.updated || 0}.`
      );
    } catch (error) {
      console.warn(error);
      showToast("error", "Backend status check failed", error.message || "Unknown error");
    } finally {
      setIsCheckingAll(false);
    }
  }

  async function handleAutoCheckActiveCases() {
    await refreshCasesFromBackend();
  }

  function handleCaseFormChange(event) {
    const { name, value } = event.target;

    setCaseForm((previous) => ({
      ...previous,
      [name]: name === "receiptNumber" ? value.toUpperCase().replace(/\s/g, "") : value,
    }));
  }

  function handleSettingsChange(event) {
    const { name, value, type, checked } = event.target;

    setSettings((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleDefaultViewChange(event) {
    const nextView = event.target.value;

    setSettings((previous) => ({
      ...previous,
      defaultView: nextView,
    }));
    setActiveView(nextView);
  }

  async function handleSubmitCase(event) {
    event.preventDefault();

    if (!caseForm.caseLabel.trim() || !caseForm.receiptNumber.trim()) {
      showToast("warning", "Missing required fields", "Case label and receipt number are required.");
      return;
    }

    if (!isValidReceiptNumber(caseForm.receiptNumber)) {
      showToast("warning", "Invalid receipt number", "Receipt number must be 3 letters followed by 10 digits. Example: IOE0912345678");
      return;
    }

    const payload = {
      caseLabel: caseForm.caseLabel.trim(),
      formType: caseForm.formType,
      receiptNumber: caseForm.receiptNumber.trim(),
      filingDate: caseForm.filingDate,
      priorityDate: caseForm.priorityDate,
      serviceCenter: caseForm.serviceCenter || "Not selected",
      category: caseForm.category,
      status: caseForm.status,
      statusDate: caseForm.statusDate,
      notes: caseForm.notes || "No tracking notes yet.",
    };

    try {
      if (modalMode === "edit" && selectedCase) {
        await apiRequest(`/api/cases/${selectedCase.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest("/api/cases", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      await loadCasesFromBackend({ silent: true });
      closeCaseModal();
      showToast("success", modalMode === "edit" ? "Case updated" : "Case added", `${payload.receiptNumber} saved to Supabase.`);
    } catch (error) {
      console.warn(error);
      showToast("error", "Could not save case", error.message || "Could not save this case.");
    }
  }

  function parseBulkCaseLine(line, index) {
    const delimiter = line.includes("\t") ? "\t" : ",";
    const parts = line
      .split(delimiter)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) return null;

    if (parts.length === 1) {
      return {
        caseLabel: `Case ${index + 1}`,
        receiptNumber: parts[0].toUpperCase(),
        formType: "Other",
        filingDate: "",
        category: "Other",
      };
    }

    return {
      caseLabel: parts[0] || `Case ${index + 1}`,
      receiptNumber: (parts[1] || "").toUpperCase(),
      formType: parts[2] || "Other",
      filingDate: parts[3] || "",
      category: parts[4] || "Other",
    };
  }

  async function handleSubmitBulkCases(event) {
    event.preventDefault();

    const lines = bulkCaseText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      showToast("warning", "No rows found", "Paste at least one receipt number or case row.");
      return;
    }

    const existingReceipts = new Set(cases.map((item) => item.receiptNumber.toUpperCase()));
    const seenReceipts = new Set();
    const errors = [];

    const parsedCases = [];

    lines.forEach((line, index) => {
      const parsedLine = parseBulkCaseLine(line, index);
      if (!parsedLine) return;

      if (!isValidReceiptNumber(parsedLine.receiptNumber)) {
        errors.push(`Line ${index + 1}: invalid receipt number (${parsedLine.receiptNumber})`);
        return;
      }

      if (existingReceipts.has(parsedLine.receiptNumber) || seenReceipts.has(parsedLine.receiptNumber)) {
        errors.push(`Line ${index + 1}: duplicate receipt number (${parsedLine.receiptNumber})`);
        return;
      }

      seenReceipts.add(parsedLine.receiptNumber);
      parsedCases.push({
        caseLabel: parsedLine.caseLabel,
        receiptNumber: parsedLine.receiptNumber,
        formType: parsedLine.formType,
        filingDate: parsedLine.filingDate,
        category: parsedLine.category,
        status: "Case Was Received",
        statusDate: new Date().toISOString().slice(0, 10),
        serviceCenter: "Not selected",
        notes: "Added through bulk import.",
      });
    });

    if (parsedCases.length === 0) {
      showToast("warning", "No cases were added", errors.join("\n"));
      return;
    }

    try {
      const result = await apiRequest("/api/cases/bulk", {
        method: "POST",
        body: JSON.stringify({ cases: parsedCases }),
      });

      await loadCasesFromBackend({ silent: true });
      closeBulkCaseModal();

      const backendErrors = result.errors || [];
      const allErrors = [
        ...errors,
        ...backendErrors.map((item) => `${item.receiptNumber || "Unknown"}: ${item.error}`),
      ];

      if (allErrors.length > 0) {
        showToast(
          "warning",
          `${result.created?.length || parsedCases.length} case(s) added`,
          `Skipped rows:\n${allErrors.join("\n")}`
        );
        return;
      }

      showToast("success", "Bulk add completed", `${result.created?.length || parsedCases.length} case(s) added.`);
    } catch (error) {
      console.warn(error);
      showToast("error", "Could not bulk add cases", error.message || "Could not bulk add cases.");
    }
  }

  async function handleDeleteSelectedCase() {
    if (!selectedCase) return;

    const confirmed = window.confirm(
      `Delete ${selectedCase.caseLabel}'s ${selectedCase.formType} case from this tracker?`
    );

    if (!confirmed) return;

    try {
      await apiRequest(`/api/cases/${selectedCase.id}`, {
        method: "DELETE",
      });

      await loadCasesFromBackend({ silent: true });
      showToast("success", "Case deleted", `${selectedCase.receiptNumber} was removed from Supabase.`);
    } catch (error) {
      console.warn(error);
      showToast("error", "Could not delete case", error.message || "Could not delete this case.");
    }
  }

  async function handleResetDemoData() {
    await loadBackendHealth();
    await loadCasesFromBackend();
  }

  function downloadTextFile(content, fileName, fileType = "application/json") {
    const blob = new Blob([content], { type: fileType });
    const url = URL.createObjectURL(blob);
    const temporaryLink = document.createElement("a");

    temporaryLink.href = url;
    temporaryLink.download = fileName;
    temporaryLink.click();

    URL.revokeObjectURL(url);
  }

  function handleExportCsv() {
    const headers = [
      "Case Label",
      "Form Type",
      "Receipt Number",
      "Filing Date",
      "Priority Date",
      "Service Center",
      "Category",
      "Status",
      "Status Date",
      "Last Checked At",
      "Notes",
    ];

    const csvBody = filteredCases
      .map((item) =>
        [
          item.caseLabel,
          item.formType,
          item.receiptNumber,
          item.filingDate,
          item.priorityDate,
          item.serviceCenter,
          item.category,
          item.status,
          item.statusDate,
          item.lastCheckedAt,
          item.notes,
        ]
          .map(escapeCsvValue)
          .join(",")
      )
      .join("\n");

    downloadTextFile(
      `${headers.map(escapeCsvValue).join(",")}\n${csvBody}`,
      `case-status-tracker-export-${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv;charset=utf-8;"
    );
  }

  function handleExportBackup() {
    const backup = {
      app: "Case Status Tracker",
      exportedAt: new Date().toISOString(),
      version: 2,
      cases,
      settings,
    };

    downloadTextFile(
      JSON.stringify(backup, null, 2),
      `case-status-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`
    );
  }

  function handleImportBackup(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const parsedBackup = JSON.parse(String(reader.result || ""));

        if (!Array.isArray(parsedBackup.cases)) {
          showToast("warning", "Invalid backup file", "Please select a valid Case Status Tracker backup JSON file.");
          return;
        }

        const confirmed = window.confirm(
          "This will import backup cases into Supabase. Existing duplicate receipts will be skipped by the backend. Continue?"
        );

        if (!confirmed) return;

        const result = await apiRequest("/api/cases/bulk", {
          method: "POST",
          body: JSON.stringify({ cases: parsedBackup.cases }),
        });

        await loadCasesFromBackend({ silent: true });
        showToast(
          "success",
          "Backup imported",
          `${result.created?.length || 0} case(s) imported. ${result.errors?.length || 0} skipped.`
        );
      } catch (error) {
        showToast("error", "Could not import backup", error.message || "Could not import this backup file.");
        console.warn(error);
      } finally {
        event.target.value = "";
      }
    };

    reader.readAsText(file);
  }

  async function handleTestBackendConnection() {
    try {
      const backendBaseUrl = settings.backendApiUrl.replace(/\/$/, "");
      const response = await fetch(`${backendBaseUrl}/api/health`);

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const result = await response.json();
      setBackendHealth(result);
      setBackendError("");
      showToast(
        "success",
        "Backend connected",
        `Status: ${result.status || "ok"} · Database: ${result.database || "unknown"} · Provider: ${result.providerMode || "unknown"}`
      );
    } catch (error) {
      console.warn(error);
      showToast(
        "error",
        "Could not connect to backend",
        "Run the server and check Backend API URL in Settings."
      );
    }
  }

  const pageTitle = views.find((item) => item.key === activeView)?.label || "Dashboard";
  const themeClass = settings.themeMode === "night" ? "theme-night" : "theme-day";

  if (!isAuthenticated) {
    return (
      <LoginScreen
        settings={settings}
        loginForm={loginForm}
        loginError={loginError}
        themeClass={themeClass}
        onChange={handleLoginFormChange}
        onSubmit={handleLoginSubmit}
      />
    );
  }

  if (!selectedCase) {
    return (
      <div className={`empty-app ${themeClass}`}>
        <div className="empty-card">
          <div className="brand-icon">CT</div>
          <h1>{settings.workspaceName}</h1>
          <p>No cases found in Supabase. Add your first USCIS case to continue.</p>
          <button onClick={openAddCaseModal} className="primary-button">
            + Add Case
          </button>
        </div>

        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

        {isCaseModalOpen && (
          <CaseModal
            modalMode={modalMode}
            caseForm={caseForm}
            onChange={handleCaseFormChange}
            onClose={closeCaseModal}
            onSubmit={handleSubmitCase}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`app-shell ${themeClass}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">CT</div>
          <div>
            <h1>{settings.workspaceName}</h1>
            <p>{settings.workspaceSubtitle}</p>
          </div>
        </div>

        <nav className="nav">
          {views.map((view) => (
            <button
              key={view.key}
              className={`nav-item ${activeView === view.key ? "active" : ""}`}
              onClick={() => setActiveView(view.key)}
            >
              {view.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className="small-label">Status Tracking Only</span>
          <p>This version tracks USCIS case status, history, exports, backups, and backend status checks only.</p>
          <button className="sidebar-reset-button" onClick={handleResetDemoData}>
            Refresh Data
          </button>
          <button className="sidebar-logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">USCIS Tracking Workspace</p>
            <h2>{pageTitle}</h2>
          </div>

          <div className="topbar-actions">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="search-input"
              placeholder="Search label, receipt, form, status..."
            />
            <button onClick={openBulkCaseModal} className="secondary-button">
              Bulk Add
            </button>
            <button onClick={openAddCaseModal} className="primary-button">
              + Add Case
            </button>
          </div>
        </header>

        {activeView === "dashboard" && (
          <DashboardView
            stats={stats}
            filteredCases={filteredCases}
            selectedCase={selectedCase}
            selectedCaseId={selectedCaseId}
            setSelectedCaseId={setSelectedCaseId}
            today={today}
            settings={settings}
            groupedByForm={groupedByForm}
            groupedByStatus={groupedByStatus}
            maxFormCount={maxFormCount}
            maxStatusCount={maxStatusCount}
            recentStatusEvents={recentStatusEvents}
            caseStatusFilter={caseStatusFilter}
            setCaseStatusFilter={setCaseStatusFilter}
            onExportCsv={handleExportCsv}
            onCheckNow={handleCheckSelectedCase}
            onCheckAllActive={handleCheckAllActiveCases}
            isCheckingAll={isCheckingAll}
            isCasesLoading={isCasesLoading}
            onNotify={showToast}
            backendError={backendError}
            backendHealth={backendHealth}
            autoCheckEnabled={settings.autoCheckEnabled}
            liveStatusChecks={settings.liveStatusChecks}
            lastAutoCheckAt={lastAutoCheckAt}
            onEditCase={openEditCaseModal}
            onDeleteCase={handleDeleteSelectedCase}
          />
        )}

        {activeView === "cases" && (
          <CasesView
            filteredCases={filteredCases}
            selectedCaseId={selectedCaseId}
            setSelectedCaseId={setSelectedCaseId}
            today={today}
            settings={settings}
            caseStatusFilter={caseStatusFilter}
            setCaseStatusFilter={setCaseStatusFilter}
            caseFormFilter={caseFormFilter}
            setCaseFormFilter={setCaseFormFilter}
            formTypes={formTypes}
            onExportCsv={handleExportCsv}
            onCheckAllActive={handleCheckAllActiveCases}
            isCheckingAll={isCheckingAll}
            onBulkAdd={openBulkCaseModal}
            onAddCase={openAddCaseModal}
          />
        )}

        {activeView === "insights" && (
          <InsightsView
            stats={stats}
            groupedByForm={groupedByForm}
            groupedByStatus={groupedByStatus}
            agingBuckets={agingBuckets}
            maxFormCount={maxFormCount}
            maxStatusCount={maxStatusCount}
            maxAgingCount={maxAgingCount}
          />
        )}

        {activeView === "settings" && (
          <SettingsView
            settings={settings}
            onChange={handleSettingsChange}
            onDefaultViewChange={handleDefaultViewChange}
            onExportBackup={handleExportBackup}
            onImportClick={() => backupInputRef.current?.click()}
            onTestBackendConnection={handleTestBackendConnection}
            onResetDemoData={handleResetDemoData}
            casesCount={cases.length}
          />
        )}

        <input
          ref={backupInputRef}
          className="hidden-file-input"
          type="file"
          accept="application/json,.json"
          onChange={handleImportBackup}
        />
      </main>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      {isCaseModalOpen && (
        <CaseModal
          modalMode={modalMode}
          caseForm={caseForm}
          onChange={handleCaseFormChange}
          onClose={closeCaseModal}
          onSubmit={handleSubmitCase}
        />
      )}

      {isBulkCaseModalOpen && (
        <BulkCaseModal
          bulkCaseText={bulkCaseText}
          setBulkCaseText={setBulkCaseText}
          onClose={closeBulkCaseModal}
          onSubmit={handleSubmitBulkCases}
        />
      )}
    </div>
  );
}

function Toast({ toast, onClose }) {
  return (
    <div className={`toast toast-${toast.type}`}>
      <div className="toast-content">
        <strong>{toast.title}</strong>
        {toast.message && <p>{toast.message}</p>}
      </div>

      <button type="button" className="toast-close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

function LoginScreen({ settings, loginForm, loginError, themeClass, onChange, onSubmit }) {
  return (
    <div className={`login-page ${themeClass}`}>
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand login-brand">
          <div className="brand-icon">CT</div>
          <div>
            <h1>{settings.workspaceName}</h1>
            <p>{settings.workspaceSubtitle}</p>
          </div>
        </div>

        <div className="login-copy">
          <p className="eyebrow">Admin Login</p>
          <h2>Sign in to your tracker</h2>
          <p>Enter your Cloudflare Worker admin username and password to access the USCIS case status dashboard.</p>
        </div>

        <label className="login-label">
          Username
          <input
            name="username"
            value={loginForm.username}
            onChange={onChange}
            placeholder=""
            autoComplete="username"
            required
          />
        </label>

        <label className="login-label">
          Password
          <input
            type="password"
            name="password"
            value={loginForm.password}
            onChange={onChange}
            placeholder=""
            autoComplete="current-password"
            required
          />
        </label>

        {loginError && <div className="login-error">{loginError}</div>}

        <button type="submit" className="primary-button login-button">
          Login
        </button>

        <p className="login-hint">
          Backend: {settings.backendApiUrl}
        </p>
      </form>
    </div>
  );
}

function DashboardView({
  stats,
  filteredCases,
  selectedCase,
  selectedCaseId,
  setSelectedCaseId,
  today,
  settings,
  groupedByForm,
  groupedByStatus,
  maxFormCount,
  maxStatusCount,
  recentStatusEvents,
  caseStatusFilter,
  setCaseStatusFilter,
  onExportCsv,
  onCheckNow,
  onCheckAllActive,
  isCheckingAll,
  isCasesLoading,
  onNotify,
  backendError,
  backendHealth,
  autoCheckEnabled,
  liveStatusChecks,
  lastAutoCheckAt,
  onEditCase,
  onDeleteCase,
}) {
  return (
    <>
      <StatsGrid
        stats={stats}
        activeFilter={caseStatusFilter}
        onSelectFilter={(filterKey) => {
          setCaseStatusFilter(filterKey);
        }}
      />

      <AutoCheckStatus
        autoCheckEnabled={autoCheckEnabled}
        liveStatusChecks={liveStatusChecks}
        lastAutoCheckAt={lastAutoCheckAt}
        backendHealth={backendHealth}
        backendError={backendError}
      />

      <QuickActionsStrip
        onCheckNow={onCheckNow}
        onCheckAllActive={onCheckAllActive}
        onExportCsv={onExportCsv}
        isCheckingAll={isCheckingAll}
      />

      <section className="content-grid">
        <CasesPanel
          filteredCases={filteredCases}
          selectedCaseId={selectedCaseId}
          setSelectedCaseId={setSelectedCaseId}
          today={today}
          settings={settings}
          onExportCsv={onExportCsv}
          onCheckAllActive={onCheckAllActive}
          isCheckingAll={isCheckingAll}
          caseStatusFilter={caseStatusFilter}
          onClearStatusFilter={() => setCaseStatusFilter("all")}
          isCasesLoading={isCasesLoading}
        />

        <CaseDetailPanel
          selectedCase={selectedCase}
          settings={settings}
          onCheckNow={onCheckNow}
          onEditCase={onEditCase}
          onDeleteCase={onDeleteCase}
          onNotify={onNotify}
        />
      </section>

      <section className="content-grid bottom-grid">
        <InsightBarsPanel
          title="Cases by Form Type"
          subtitle="Internal tracking data"
          data={groupedByForm}
          max={maxFormCount}
        />

        <InsightBarsPanel
          title="Cases by Status"
          subtitle="Current USCIS status groups"
          data={groupedByStatus}
          max={maxStatusCount}
        />
      </section>

      <RecentUpdatesPanel
        recentStatusEvents={recentStatusEvents}
        setSelectedCaseId={setSelectedCaseId}
      />
    </>
  );
}

function QuickActionsStrip({ onCheckNow, onCheckAllActive, onExportCsv, isCheckingAll }) {
  return (
    <section className="quick-actions-strip">
      <div className="quick-actions-copy">
        <strong>Quick Actions</strong>
        <span>Run USCIS checks or export current tracker data.</span>
      </div>

      <div className="quick-actions-strip-buttons">
        <button onClick={onCheckNow} className="secondary-button">
          Check Selected Case
        </button>
        <button onClick={onCheckAllActive} className="secondary-button" disabled={isCheckingAll}>
          {isCheckingAll ? "Checking..." : "Check All Active"}
        </button>
        <button onClick={onExportCsv} className="secondary-button">
          Export CSV
        </button>
      </div>
    </section>
  );
}

function AutoCheckStatus({
  autoCheckEnabled,
  liveStatusChecks,
  lastAutoCheckAt,
  backendHealth,
  backendError,
}) {
  const backendCronActive = Boolean(backendHealth?.autoCheckEnabled);
  const databaseStatus = backendHealth?.database || "unknown";
  const providerMode = backendHealth?.providerMode || "unknown";

  return (
    <div className={`auto-check-banner ${backendCronActive ? "running" : "paused"}`}>
      <div>
        <strong>{backendCronActive ? "Backend Auto Check Active" : "Backend Auto Check Not Confirmed"}</strong>
        <span>
          {backendError
            ? `Backend error: ${backendError}`
            : backendCronActive
              ? `Backend cron checks active cases every ${AUTO_CHECK_INTERVAL_MINUTES} minutes, even if the browser is closed.`
              : "Run backend and verify /api/health to confirm scheduled checks."}
        </span>
      </div>

      <div className="auto-check-meta">
        DB: {databaseStatus} · Provider: {providerMode} · Last refresh: {lastAutoCheckAt ? formatDate(lastAutoCheckAt) : "—"}
      </div>
    </div>
  );
}

function StatsGrid({ stats, activeFilter = "all", onSelectFilter }) {
  function resolveFilterKey(cardKey) {
    return cardKey === "total" ? "all" : cardKey;
  }

  return (
    <section className="stats-grid status-stats-grid">
      {statusCards.map((card) => {
        const filterKey = resolveFilterKey(card.key);
        const isActive = activeFilter === filterKey;

        return (
          <button
            key={card.key}
            type="button"
            className={`stat-card stat-card-button ${card.className} ${isActive ? "active" : ""}`}
            onClick={() => onSelectFilter?.(filterKey)}
          >
            <span>{card.label}</span>
            <strong>{stats[card.key] || 0}</strong>
            <p>{card.helper}</p>
          </button>
        );
      })}
    </section>
  );
}

function CasesPanel({
  filteredCases,
  selectedCaseId,
  setSelectedCaseId,
  today,
  settings,
  onExportCsv,
  onCheckAllActive,
  isCheckingAll,
  caseStatusFilter = "all",
  onClearStatusFilter,
  isCasesLoading = false,
}) {
  return (
    <div className="panel large-panel">
      <div className="panel-header">
        <div>
          <h3>Tracked Cases</h3>
          <p>{isCasesLoading ? "Loading cases from Supabase..." : `${filteredCases.length} case shown · Supabase database`}</p>
          {caseStatusFilter !== "all" && (
            <button type="button" className="active-filter-chip" onClick={onClearStatusFilter}>
              Filter active: {caseStatusFilter} ×
            </button>
          )}
        </div>
        <div className="panel-header-actions">
          <button onClick={onCheckAllActive} className="secondary-button" disabled={isCheckingAll}>
            {isCheckingAll ? "Checking..." : "Check All Active"}
          </button>
          <button onClick={onExportCsv} className="secondary-button">
            Export CSV
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Case Label</th>
              <th>Form</th>
              <th>Receipt</th>
              <th>Status</th>
              <th>Status Date</th>
              <th>Pending</th>
              <th>Last Checked</th>
            </tr>
          </thead>
          <tbody>
            {filteredCases.map((item) => (
              <tr
                key={item.id}
                onClick={() => setSelectedCaseId(item.id)}
                className={selectedCaseId === item.id ? "selected-row" : ""}
              >
                <td>
                  <div className="client-cell">
                    <strong>{item.caseLabel}</strong>
                    <span>{item.category}</span>
                  </div>
                </td>
                <td>{item.formType}</td>
                <td>{displayReceipt(item.receiptNumber, settings.maskReceiptNumbers)}</td>
                <td>
                  <span className={`status-pill ${getStatusClass(item.status)}`}>{item.status}</span>
                </td>
                <td>{formatDate(item.statusDate)}</td>
                <td>{daysBetween(item.filingDate, today)} days</td>
                <td>{formatDate(item.lastCheckedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CaseDetailPanel({
  selectedCase,
  settings,
  onCheckNow,
  onEditCase,
  onDeleteCase,
  onNotify,
}) {
  const latestEvent = selectedCase.history?.[0];
  const statusAgeDays = daysBetween(selectedCase.statusDate);
  async function handleCopyReceipt() {
    try {
      await navigator.clipboard.writeText(selectedCase.receiptNumber);
      onNotify?.("success", "Receipt copied", selectedCase.receiptNumber);
    } catch (error) {
      onNotify?.("warning", "Could not copy receipt", "You can manually select and copy it.");
    }
  }

  return (
    <div className="panel">
      <div className="panel-header detail-actions-header">
        <div>
          <h3>Case Detail</h3>
          <p>{selectedCase.caseLabel}</p>
        </div>
        <div className="detail-actions">
          <button onClick={onCheckNow} className="secondary-button">
            Check Now
          </button>
          <button onClick={handleCopyReceipt} className="secondary-button">
            Copy Receipt
          </button>
          <button onClick={onEditCase} className="secondary-button">
            Edit
          </button>
        </div>
      </div>

      <div className="detail-card">
        <div className="detail-top">
          <div>
            <span className="small-label">Current Status</span>
            <h4>{selectedCase.status}</h4>
            <p className="status-subline">
              Status age: {statusAgeDays} day{statusAgeDays === 1 ? "" : "s"}
            </p>
          </div>
          <span className={`status-dot ${getStatusClass(selectedCase.status)}`} />
        </div>

        <div className="detail-grid">
          <div>
            <span>Receipt</span>
            <strong>{displayReceipt(selectedCase.receiptNumber, settings.maskReceiptNumbers)}</strong>
          </div>
          <div>
            <span>Form</span>
            <strong>{selectedCase.formType}</strong>
          </div>
          <div>
            <span>Filed</span>
            <strong>{formatDate(selectedCase.filingDate)}</strong>
          </div>
          <div>
            <span>Status Date</span>
            <strong>{formatDate(selectedCase.statusDate)}</strong>
          </div>
          <div>
            <span>Priority Date</span>
            <strong>{formatDate(selectedCase.priorityDate)}</strong>
          </div>
          <div>
            <span>Service Center</span>
            <strong>{selectedCase.serviceCenter}</strong>
          </div>
          <div>
            <span>Category</span>
            <strong>{selectedCase.category}</strong>
          </div>
          <div>
            <span>Last Checked</span>
            <strong>{getShortDateTime(selectedCase.lastCheckedAt)}</strong>
          </div>
        </div>

        {latestEvent && (
          <div className="latest-check-box">
            <div>
              <span className="small-label">Latest Tracker Event</span>
              <strong>{latestEvent.title}</strong>
              <p>{latestEvent.text}</p>
            </div>
            <div className="latest-check-meta">
              <span>{formatDate(latestEvent.date)}</span>
              <em>{getEventSourceLabel(latestEvent.source)}</em>
            </div>
          </div>
        )}

        <div className="notes-box">
          <span className="small-label">Tracking Notes</span>
          <p>{selectedCase.notes}</p>
        </div>

        <button onClick={onDeleteCase} className="danger-button full-width-button">
          Delete Case
        </button>
      </div>

      <div className="timeline">
        <h4>Status History</h4>

        {selectedCase.history.map((event, index) => (
          <div className="timeline-item" key={`${event.date}-${event.title}-${index}`}>
            <div className="timeline-marker" />
            <div>
              <span>
                {formatDate(event.date)} · {getEventSourceLabel(event.source)}
              </span>
              <strong>{event.title}</strong>
              <p>{event.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentUpdatesPanel({ recentStatusEvents, setSelectedCaseId }) {
  return (
    <section className="panel recent-updates-panel">
      <div className="panel-header">
        <div>
          <h3>Recent Status Activity</h3>
          <p>Latest USCIS checks, manual edits, and backend cron updates.</p>
        </div>
      </div>

      {recentStatusEvents.length === 0 ? (
        <p className="muted-text">No status activity yet.</p>
      ) : (
        <div className="recent-updates-list">
          {recentStatusEvents.map((event, index) => (
            <button
              key={`${event.caseId}-${event.date}-${event.title}-${index}`}
              type="button"
              className="recent-update-item"
              onClick={() => setSelectedCaseId(event.caseId)}
            >
              <div className="recent-update-main">
                <div className="recent-update-title-row">
                  <strong>{event.title}</strong>
                  <span>{getEventSourceLabel(event.source)}</span>
                </div>

                <p>{event.text || "No additional details."}</p>

                <div className="recent-update-meta">
                  <span>{event.caseLabel}</span>
                  <span>{event.formType}</span>
                  <span>{event.receiptNumber}</span>
                </div>
              </div>

              <div className="recent-update-date">{getShortDateTime(event.date)}</div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function InsightBarsPanel({ title, subtitle, data, max }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="bars">
        {data.map((item) => (
          <BarRow key={item.label} label={item.label} value={item.value} max={max} />
        ))}
      </div>
    </div>
  );
}

function CasesView({
  filteredCases,
  selectedCaseId,
  setSelectedCaseId,
  today,
  settings,
  caseStatusFilter,
  setCaseStatusFilter,
  caseFormFilter,
  setCaseFormFilter,
  formTypes,
  onExportCsv,
  onCheckAllActive,
  isCheckingAll,
  onBulkAdd,
  onAddCase,
}) {
  return (
    <>
      <section className="page-toolbar panel">
        <div>
          <h3>Case Filters</h3>
          <p>Filter receipts by status group and form type.</p>
        </div>

        <div className="filter-row">
          <select value={caseStatusFilter} onChange={(event) => setCaseStatusFilter(event.target.value)}>
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="received">Case Received</option>
            <option value="biometric">Biometric Scheduled</option>
            <option value="rfe">RFE</option>
            <option value="interview">Interview Scheduled</option>
            <option value="approved">Approved / Card Produced</option>
            <option value="rejected">Rejected / Denied</option>
          </select>

          <select value={caseFormFilter} onChange={(event) => setCaseFormFilter(event.target.value)}>
            <option value="all">All Forms</option>
            {formTypes.map((formType) => (
              <option key={formType} value={formType}>
                {formType}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setCaseStatusFilter("all");
              setCaseFormFilter("all");
            }}
            className="secondary-button"
          >
            Clear Filters
          </button>

          <button onClick={onCheckAllActive} className="secondary-button" disabled={isCheckingAll}>
            {isCheckingAll ? "Checking..." : "Check All Active"}
          </button>

          <button onClick={onBulkAdd} className="secondary-button">
            Bulk Add
          </button>

          <button onClick={onAddCase} className="primary-button">
            + Add Case
          </button>
        </div>
      </section>

      <CasesPanel
        filteredCases={filteredCases}
        selectedCaseId={selectedCaseId}
        setSelectedCaseId={setSelectedCaseId}
        today={today}
        settings={settings}
        onExportCsv={onExportCsv}
        onCheckAllActive={onCheckAllActive}
        isCheckingAll={isCheckingAll}
        caseStatusFilter={caseStatusFilter}
        onClearStatusFilter={() => setCaseStatusFilter("all")}
      />
    </>
  );
}

function InsightsView({
  stats,
  groupedByForm,
  groupedByStatus,
  agingBuckets,
  maxFormCount,
  maxStatusCount,
  maxAgingCount,
}) {
  return (
    <>
      <StatsGrid stats={stats} />

      <section className="content-grid bottom-grid">
        <InsightBarsPanel
          title="Cases by Form Type"
          subtitle="Distribution across USCIS forms"
          data={groupedByForm}
          max={maxFormCount}
        />

        <InsightBarsPanel
          title="Cases by Status"
          subtitle="Current status groups"
          data={groupedByStatus}
          max={maxStatusCount}
        />

        <InsightBarsPanel
          title="Case Aging"
          subtitle="Days since filing date"
          data={agingBuckets}
          max={maxAgingCount}
        />
      </section>

      <section className="panel insight-summary">
        <h3>Tracker Snapshot</h3>
        <div className="summary-grid">
          <div>
            <span>Total Cases</span>
            <strong>{stats.total}</strong>
          </div>
          <div>
            <span>Case Received</span>
            <strong>{stats.received}</strong>
          </div>
          <div>
            <span>Interview Scheduled</span>
            <strong>{stats.interview}</strong>
          </div>
          <div>
            <span>Approved / Card Produced</span>
            <strong>{stats.approved}</strong>
          </div>
        </div>
      </section>
    </>
  );
}

function SettingsView({
  settings,
  onChange,
  onDefaultViewChange,
  onExportBackup,
  onImportClick,
  onTestBackendConnection,
  onResetDemoData,
  casesCount,
}) {
  return (
    <section className="settings-grid">
      <div className="panel settings-panel">
        <div className="panel-header">
          <div>
            <h3>Workspace</h3>
            <p>Customize the tracker label.</p>
          </div>
        </div>

        <label className="settings-label">
          Workspace Name
          <input
            name="workspaceName"
            value={settings.workspaceName}
            onChange={onChange}
            placeholder="Case Status Tracker"
          />
        </label>

        <label className="settings-label">
          Subtitle
          <input
            name="workspaceSubtitle"
            value={settings.workspaceSubtitle}
            onChange={onChange}
            placeholder="Private USCIS tracking dashboard"
          />
        </label>

        <label className="settings-label">
          Default View
          <select name="defaultView" value={settings.defaultView} onChange={onDefaultViewChange}>
            {views.map((view) => (
              <option key={view.key} value={view.key}>
                {view.label}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-label">
          Theme
          <select name="themeMode" value={settings.themeMode} onChange={onChange}>
            <option value="day">Day Mode</option>
            <option value="night">Night Mode</option>
          </select>
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            name="maskReceiptNumbers"
            checked={settings.maskReceiptNumbers}
            onChange={onChange}
          />
          <span>
            <strong>Mask receipt numbers</strong>
            <small>Recommended when sharing your screen.</small>
          </span>
        </label>
      </div>

      <div className="panel settings-panel">
        <div className="panel-header">
          <div>
            <h3>Backend / USCIS API</h3>
            <p>Server-side status checks only.</p>
          </div>
        </div>

        <label className="settings-label">
          Backend API URL
          <input
            name="backendApiUrl"
            value={settings.backendApiUrl}
            onChange={onChange}
            placeholder="http://localhost:4000"
          />
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            name="liveStatusChecks"
            checked={settings.liveStatusChecks}
            onChange={onChange}
          />
          <span>
            <strong>Use backend for Check Now</strong>
            <small>Cloudflare Worker is now your online backend.</small>
          </span>
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            name="autoCheckEnabled"
            checked={settings.autoCheckEnabled}
            onChange={onChange}
          />
          <span>
            <strong>Auto check every 15 minutes</strong>
            <small>Runs only while this app is open and backend live checks are enabled.</small>
          </span>
        </label>

        <div className="settings-actions">
          <button onClick={onTestBackendConnection} className="secondary-button">
            Test Backend Connection
          </button>
        </div>

        <p className="settings-note">
          USCIS credentials belong only in the backend .env file. Never place API secrets in React.
        </p>
      </div>

      <div className="panel settings-panel">
        <div className="panel-header">
          <div>
            <h3>Data Management</h3>
            <p>Backup or restore local tracking data.</p>
          </div>
        </div>

        <div className="data-summary">
          <div>
            <span>Tracked Cases</span>
            <strong>{casesCount}</strong>
          </div>
        </div>

        <div className="settings-actions">
          <button onClick={onExportBackup} className="primary-button">
            Export JSON Backup
          </button>
          <button onClick={onImportClick} className="secondary-button">
            Import JSON Backup
          </button>
          <button onClick={onResetDemoData} className="danger-button">
            Refresh Data
          </button>
        </div>

        <p className="settings-note">
          Local storage is saved only in this browser. Export JSON backup before clearing browser data.
        </p>
      </div>
    </section>
  );
}

function CaseModal({ modalMode, caseForm, onChange, onClose, onSubmit }) {
  const isEditMode = modalMode === "edit";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="case-modal" onSubmit={onSubmit} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{isEditMode ? "Update Tracked Case" : "New Tracked Case"}</p>
            <h3>{isEditMode ? "Edit Case" : "Add Case"}</h3>
          </div>

          <button type="button" className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="form-grid">
          <label>
            <span>Case Label *</span>
            <input
              name="caseLabel"
              value={caseForm.caseLabel}
              onChange={onChange}
              placeholder="Client name or internal label"
              required
            />
          </label>

          <label>
            <span>Receipt Number *</span>
            <input
              name="receiptNumber"
              value={caseForm.receiptNumber}
              onChange={onChange}
              placeholder="IOE0912345678"
              required
            />
          </label>

          <label>
            <span>Form Type</span>
            <select name="formType" value={caseForm.formType} onChange={onChange}>
              <option>I-130</option>
              <option>I-485</option>
              <option>I-765</option>
              <option>I-131</option>
              <option>N-400</option>
              <option>I-751</option>
              <option>I-589</option>
              <option>I-90</option>
              <option>I-821D</option>
              <option>Other</option>
            </select>
          </label>

          <label>
            <span>Category</span>
            <select name="category" value={caseForm.category} onChange={onChange}>
              <option>Marriage-Based AOS</option>
              <option>Immediate Relative Petition</option>
              <option>Employment Authorization</option>
              <option>Advance Parole</option>
              <option>Naturalization</option>
              <option>Removal of Conditions</option>
              <option>Asylum</option>
              <option>DACA</option>
              <option>Other</option>
            </select>
          </label>

          <label>
            <span>Filing Date</span>
            <input
              type="date"
              name="filingDate"
              value={caseForm.filingDate}
              onChange={onChange}
            />
          </label>

          <label>
            <span>Priority Date</span>
            <input
              type="date"
              name="priorityDate"
              value={caseForm.priorityDate}
              onChange={onChange}
            />
          </label>

          <label>
            <span>Service Center</span>
            <select name="serviceCenter" value={caseForm.serviceCenter} onChange={onChange}>
              <option value="">Select service center</option>
              <option>NBC</option>
              <option>Texas Service Center</option>
              <option>Nebraska Service Center</option>
              <option>California Service Center</option>
              <option>Potomac Service Center</option>
              <option>Vermont Service Center</option>
              <option>Online Filing</option>
              <option>Not selected</option>
            </select>
          </label>

          <label>
            <span>Current Status</span>
            <select name="status" value={caseForm.status} onChange={onChange}>
              <option>Case Was Received</option>
              <option>Case Is Being Actively Reviewed</option>
              <option>Biometrics Appointment Was Scheduled</option>
              <option>Biometrics Were Taken</option>
              <option>Request for Evidence Was Sent</option>
              <option>Response To USCIS' Request For Evidence Was Received</option>
              <option>Interview Was Scheduled</option>
              <option>Case Approved</option>
              <option>Card Was Produced</option>
              <option>Case Was Denied</option>
              <option>Case Was Rejected</option>
            </select>
          </label>

          <label>
            <span>Status Date</span>
            <input
              type="date"
              name="statusDate"
              value={caseForm.statusDate}
              onChange={onChange}
            />
          </label>
        </div>

        <label className="full-label">
          <span>Tracking Notes</span>
          <textarea
            name="notes"
            value={caseForm.notes}
            onChange={onChange}
            placeholder="Optional tracking notes..."
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>

          <button type="submit" className="primary-button">
            {isEditMode ? "Save Changes" : "Save Case"}
          </button>
        </div>
      </form>
    </div>
  );
}

function BulkCaseModal({ bulkCaseText, setBulkCaseText, onClose, onSubmit }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="case-modal bulk-modal" onSubmit={onSubmit} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Multiple USCIS Receipts</p>
            <h3>Bulk Add Cases</h3>
          </div>

          <button type="button" className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="bulk-help">
          <p>Paste one case per line. Supported format:</p>
          <code>
            Case Label, Receipt Number, Form Type, Filing Date, Category
          </code>
          <p>Receipt-only lines are also supported:</p>
          <code>IOE0912345678</code>
        </div>

        <label className="full-label">
          <span>Bulk Case Rows</span>
          <textarea
            className="bulk-textarea"
            value={bulkCaseText}
            onChange={(event) => setBulkCaseText(event.target.value)}
            placeholder={"Ahmet C., IOE0912345678, I-485, 2026-01-12, Marriage-Based AOS\nMSC2490012882"}
            required
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>

          <button type="submit" className="primary-button">
            Add Cases
          </button>
        </div>
      </form>
    </div>
  );
}
