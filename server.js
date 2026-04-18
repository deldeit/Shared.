import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";

const app = express();
app.use(cors());

/* FILE HANDLING (memory upload) */
const upload = multer({ storage: multer.memoryStorage() });

/* OPENAI */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* HEALTH CHECK (Render test) */
app.get("/", (req, res) => {
  res.json({ ok: true, service: "shared-backend" });
});

/* MODERATION ENDPOINT */
app.post("/moderate", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({ ok: false, error: "no file received" });
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

    const flagged = result?.flagged === true;

    return res.json({
      ok: !flagged,
      flagged: flagged
    });

  } catch (err) {
    console.error("MODERATION ERROR:", err);
    return res.json({
      ok: false,
      error: "server error"
    });
  }
});

/* START SERVER (RENDER SAFE) */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
