import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

/* OPENAI */
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
   IMAGE MODERATION
========================= */
app.post("/moderate", upload.single("file"), async (req, res) => {
  try {
    console.log("📥 moderation request received");

    if (!req.file) {
      return res.json({
        ok: false,
        error: "no file received"
      });
    }

    const base64 = req.file.buffer.toString("base64");

    const response = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: [
        {
          type: "input_image",
          image_base64: base64
        }
      ]
    });

    const result = response.results?.[0];

    if (!result) {
      return res.json({
        ok: true,
        flagged: false,
        warning: "no moderation result (fail-open)"
      });
    }

    const flagged = result.flagged === true;

    console.log("🔍 flagged:", flagged);

    return res.json({
      ok: !flagged,
      flagged,
      categories: result.categories || {},
      scores: result.category_scores || {}
    });

  } catch (err) {
    console.error("❌ moderation error:", err);

    // FAIL OPEN (non blocca upload se OpenAI fallisce)
    return res.json({
      ok: true,
      flagged: false,
      warning: "moderation failed, allowed by fallback",
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
