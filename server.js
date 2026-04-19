import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

/* ENV */
const {
  OPENAI_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_BUCKET = "shared",
  PORT = 3000
} = process.env;

/* OPENAI */
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/* SUPABASE ADMIN */
const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

/* =========================
   CHAT HELPERS
========================= */
async function getProfile(user_id) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("id", user_id)
    .single();

  return data;
}

/* =========================
   SEND MESSAGE (CHAT API)
========================= */
app.post("/send-message", async (req, res) => {
  try {
    const { sender_id, receiver_id, content } = req.body;

    if (!sender_id || !receiver_id || !content?.trim()) {
      return res.status(400).json({ ok: false, error: "invalid_payload" });
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .insert({
        sender_id,
        receiver_id,
        content: content.trim()
      })
      .select()
      .single();

    if (error) throw error;

    return res.json({ ok: true, message: data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================
   GET CHAT HISTORY
========================= */
app.get("/get-chat", async (req, res) => {
  try {
    const { user1, user2 } = req.query;

    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`
      )
      .order("created_at", { ascending: true });

    if (error) throw error;

    return res.json({ ok: true, messages: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================
   GET USER PROFILE (CHAT HEADER)
========================= */
app.get("/user", async (req, res) => {
  try {
    const { id } = req.query;

    const profile = await getProfile(id);

    return res.json({
      ok: true,
      profile
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================
   PRESENCE (LAST SEEN)
========================= */
app.post("/presence", async (req, res) => {
  try {
    const { user_id } = req.body;

    await supabaseAdmin
      .from("presence")
      .upsert({
        user_id,
        last_seen: new Date().toISOString()
      });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================
   EVERYTHING BELOW = YOUR ORIGINAL CODE
   (unchanged)
========================= */

/* HEALTH CHECK */
app.get("/", (req, res) => {
  res.json({ ok: true, service: "shared-backend" });
});

/* MODERATION STATUS */
app.get("/moderate", (req, res) => {
  res.json({ ok: true });
});

/* IMAGE MODERATION */
app.post("/moderate", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, flagged: true });
    }

    const response = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: [
        {
          type: "image_url",
          image_url: {
            url: `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
          }
        }
      ]
    });

    const result = response.results?.[0];

    return res.json({
      ok: !result?.flagged,
      flagged: result?.flagged
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/* START */
app.listen(PORT, () => {
  console.log("🚀 Server running on", PORT);
});
