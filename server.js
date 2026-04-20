import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

/* ENV */
const {
  OPENAI_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PORT = 3000
} = process.env;

/* VALIDAZIONE ENV */
if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing environment variables");
}

/* OPENAI */
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/* SUPABASE ADMIN */
const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

/* =========================
   HELPERS
========================= */
async function getProfile(user_id) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("id", user_id)
    .single();

  if (error) throw error;
  return data;
}

/* =========================
   SEND MESSAGE
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

    res.json({ ok: true, message: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================
   GET CHAT
========================= */
app.get("/get-chat", async (req, res) => {
  try {
    const { user1, user2 } = req.query;

    if (!user1 || !user2) {
      return res.status(400).json({ ok: false, error: "missing_users" });
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`
      )
      .order("created_at", { ascending: true });

    if (error) throw error;

    res.json({ ok: true, messages: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================
   USER PROFILE
========================= */
app.get("/user", async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ ok: false, error: "missing_id" });
    }

    const profile = await getProfile(id);

    res.json({ ok: true, profile });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================
   PRESENCE
========================= */
app.post("/presence", async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ ok: false, error: "missing_user_id" });
    }

    const { error } = await supabaseAdmin
      .from("presence")
      .upsert({
        user_id,
        last_seen: new Date().toISOString()
      });

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================
   MODERATION
========================= */
app.post("/moderate", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, flagged: true });
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

    res.json({
      ok: !result?.flagged,
      flagged: result?.flagged
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* HEALTH */
app.get("/", (req, res) => {
  res.json({ ok: true });
});

/* START */
app.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});
