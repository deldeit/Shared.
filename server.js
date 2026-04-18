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
   HEALTH CHECK ROOT
========================= */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "shared-backend",
    status: "running"
  });
});

/* =========================
   STATUS PAGE /moderate (GET)
   👉 ora esiste davvero
========================= */
app.get("/moderate", (req, res) => {
  res.json({
    ok: true,
    endpoint: "/moderate",
    method: "POST",
    status: "active",
    service: "image moderation ready"
  });
});

/* =========================
   MODERATION ENDPOINT (POST)
========================= */
app.post("/moderate", upload.single("file"), async (req, res) => {
  try {

    console.log("📥 /moderate called");

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

    console.log("🔍 moderation response:", JSON.stringify(response, null, 2));

    const result = response.results?.[0];

    // 🔥 SAFE DEFAULT: non bloccare se API è incerta
    if (!result) {
      return res.json({
        ok: true,
        warning: "no moderation result returned, allowed by default"
      });
    }

    const flagged = result.flagged === true;

    return res.json({
      ok: !flagged,
      flagged,
      categories: result.categories || {}
    });

  } catch (err) {
    console.error("❌ MODERATION ERROR:", err);

    // 🔥 FAIL OPEN (non blocca tutto il sistema)
    return res.json({
      ok: true,
      warning: "moderation failed, allowed by fallback",
      error: err.message
    });
  }
});

/* =========================
   START SERVER (RENDER SAFE)
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});
