import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

/* =========================
   OPENAI
========================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "shared-backend",
    status: "running"
  });
});

/* =========================
   MODERATION STATUS
========================= */
app.get("/moderate", (req, res) => {
  res.json({
    ok: true,
    endpoint: "/moderate",
    model: "omni-moderation-latest",
    status: "active"
  });
});

/* =========================
   IMAGE MODERATION (STRICT)
========================= */
app.post("/moderate", upload.single("file"), async (req, res) => {
  try {
    console.log("📥 moderation request");

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        flagged: true,
        reason: "no file received"
      });
    }

    const base64 = req.file.buffer.toString("base64");

    const response = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: {
        image: base64
      }
    });

    const result = response.results?.[0] || response.output?.[0];

    /* =========================
       FAIL CLOSED (IMPORTANT)
    ========================= */
    if (!result) {
      return res.status(200).json({
        ok: false,
        flagged: true,
        reason: "no moderation result"
      });
    }

    const categories = result.categories || {};
    const scores = result.category_scores || {};

    /* =========================
       SAFE THRESHOLD SYSTEM
    ========================= */
    let flagged = result.flagged === true;

    // extra safety layer (fallback heuristic)
    const dangerousScore = Object.values(scores)
      .some(score => typeof score === "number" && score > 0.6);

    if (dangerousScore) {
      flagged = true;
    }

    console.log("🔍 flagged:", flagged);

    return res.json({
      ok: !flagged,
      flagged,
      categories,
      scores
    });

  } catch (err) {
    console.error("❌ moderation error:", err);

    /* =========================
       FAIL CLOSED ON ERROR
    ========================= */
    return res.status(200).json({
      ok: false,
      flagged: true,
      reason: "moderation error (blocked by default)",
      error: err.message
    });
  }
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});
