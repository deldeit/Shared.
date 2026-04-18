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

/* 🔥 HEALTH CHECK (OBBLIGATORIO PER RENDER DEBUG) */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    status: "server alive"
  });
});

/* 🔥 TEST ROUTE PER VERIFICARE CHE POST FUNZIONA */
app.post("/ping", (req, res) => {
  res.json({ ok: true, message: "POST works" });
});

/* 🔥 MODERATION */
app.post("/moderate", upload.single("file"), async (req, res) => {
  try {

    console.log("👉 /moderate HIT");

    if (!req.file) {
      return res.json({ ok: false, error: "no file" });
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

    console.log("OPENAI RESPONSE:", response);

    const flagged = response.results?.[0]?.flagged ?? false;

    return res.json({
      ok: !flagged,
      flagged
    });

  } catch (err) {
    console.error("MODERATION ERROR:", err);

    return res.status(500).json({
      ok: false,
      error: "internal error"
    });
  }
});

/* 🔥 IMPORTANTISSIMO PER RENDER */
const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});
