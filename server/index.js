import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import { isSupabaseConfigured, supabase } from "./lib/supabase.js";
import { getProviderMode } from "./lib/uscisProvider.js";
import {
  checkActiveCases,
  checkCaseById,
  createCase,
  createCasesBulk,
  deleteCase,
  listCases,
  updateCase,
} from "./lib/caseService.js";

const app = express();
const port = process.env.PORT || 4000;

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.FRONTEND_ORIGIN,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked request from origin: ${origin}`));
    },
  })
);

app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Case Status Tracker Backend",
    message: "Use /api/health to test the backend.",
  });
});

app.get("/api/health", async (req, res) => {
  let database = "not-configured";

  if (isSupabaseConfigured) {
    const { error } = await supabase.from("cases").select("id", { count: "exact", head: true });
    database = error ? "error" : "ok";
  }

  res.json({
    status: "ok",
    service: "Case Status Tracker Backend",
    database,
    providerMode: getProviderMode(),
    autoCheckEnabled: process.env.AUTO_CHECK_ENABLED !== "false",
    autoCheckCron: process.env.AUTO_CHECK_CRON || "*/15 * * * *",
    allowedOrigins,
    time: new Date().toISOString(),
  });
});

app.get("/api/cases", async (req, res, next) => {
  try {
    const cases = await listCases();
    res.json({ cases });
  } catch (error) {
    next(error);
  }
});

app.post("/api/cases", async (req, res, next) => {
  try {
    const createdCase = await createCase(req.body);
    res.status(201).json({ case: createdCase });
  } catch (error) {
    next(error);
  }
});

app.post("/api/cases/bulk", async (req, res, next) => {
  try {
    const result = await createCasesBulk(req.body.cases || []);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.put("/api/cases/:id", async (req, res, next) => {
  try {
    const updatedCase = await updateCase(req.params.id, req.body);
    res.json({ case: updatedCase });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/cases/:id", async (req, res, next) => {
  try {
    const result = await deleteCase(req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/cases/:id/check", async (req, res, next) => {
  try {
    const result = await checkCaseById(req.params.id, {
      recordNoChange: true,
      source: "manual-check",
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/cases/check-active", async (req, res, next) => {
  try {
    const result = await checkActiveCases({
      recordNoChange: true,
      source: "manual-check-all",
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);

  res.status(error.statusCode || 500).json({
    error: error.message || "Internal server error.",
  });
});

const autoCheckEnabled = process.env.AUTO_CHECK_ENABLED !== "false";
const autoCheckCron = process.env.AUTO_CHECK_CRON || "*/15 * * * *";

if (autoCheckEnabled) {
  cron.schedule(autoCheckCron, async () => {
    try {
      console.log(`[auto-check] started at ${new Date().toISOString()}`);
      const result = await checkActiveCases({
        recordNoChange: false,
        source: "backend-cron",
      });
      console.log(
        `[auto-check] checked=${result.checked}, updated=${result.updated}, errors=${result.errors.length}`
      );
    } catch (error) {
      console.error("[auto-check] failed:", error);
    }
  });
}

app.listen(port, () => {
  console.log(`Case Status Tracker backend running on http://localhost:${port}`);
  console.log(`Allowed frontend origins: ${allowedOrigins.join(", ")}`);
  console.log(`Supabase configured: ${isSupabaseConfigured ? "yes" : "no"}`);
  console.log(`Provider mode: ${getProviderMode()}`);
  console.log(`Auto check: ${autoCheckEnabled ? autoCheckCron : "disabled"}`);
});
