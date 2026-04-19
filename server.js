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

if (!OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY");
}
if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

/* OPENAI */
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

/* SUPABASE ADMIN */
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
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
   HELPERS
========================= */
function toDataUrl(buffer, mimeType = "image/jpeg") {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function moderateContent({ caption, imageBuffer, imageMimeType }) {
  const input = [];

  if (caption && caption.trim()) {
    input.push({
      type: "text",
      text: caption.trim()
    });
  }

  if (imageBuffer) {
    input.push({
      type: "image_url",
      image_url: {
        url: toDataUrl(imageBuffer, imageMimeType || "image/jpeg")
      }
    });
  }

  if (input.length === 0) {
    return {
      ok: false,
      flagged: true,
      reason: "empty moderation input"
    };
  }

  const response = await openai.moderations.create({
    model: "omni-moderation-latest",
    input
  });

  const result = response.results?.[0];

  if (!result) {
    return {
      ok: false,
      flagged: true,
      reason: "no moderation result"
    };
  }

  return {
    ok: !result.flagged,
    flagged: result.flagged === true,
    categories: result.categories || {},
    scores: result.category_scores || {},
    appliedInputTypes: result.category_applied_input_types || {}
  };
}

function safeName(value, fallback = "user") {
  const v = String(value || "").trim();
  return v.length ? v : fallback;
}

/* =========================
   IMAGE MODERATION ONLY
   (compatibile con il tuo home.html)
========================= */
app.post("/moderate", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        flagged: true,
        reason: "no file received"
      });
    }

    const mod = await moderateContent({
      caption: "",
      imageBuffer: req.file.buffer,
      imageMimeType: req.file.mimetype || "image/jpeg"
    });

    return res.json(mod);
  } catch (err) {
    console.error("moderation error:", err);
    return res.status(200).json({
      ok: false,
      flagged: true,
      reason: "moderation error",
      error: err.message
    });
  }
});

/* =========================
   CREATE POST
   multipart/form-data:
   - file
   - caption
   - song_title
   - song_preview
   - user_id
   - username
========================= */
app.post("/create-post", upload.single("file"), async (req, res) => {
  try {
    const {
      caption = "",
      song_title = "",
      song_preview = "",
      user_id = "",
      username = ""
    } = req.body;

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "image_required"
      });
    }

    if (!user_id) {
      return res.status(400).json({
        ok: false,
        error: "user_id_required"
      });
    }

    if (!caption.trim()) {
      return res.status(400).json({
        ok: false,
        error: "caption_required"
      });
    }

    if (!song_title.trim() || !song_preview.trim()) {
      return res.status(400).json({
        ok: false,
        error: "song_required"
      });
    }

    /* 1) moderation testo + immagine insieme */
    const mod = await moderateContent({
      caption,
      imageBuffer: req.file.buffer,
      imageMimeType: req.file.mimetype || "image/jpeg"
    });

    if (mod.flagged) {
      return res.status(403).json({
        ok: false,
        error: "content_blocked_by_moderation",
        moderation: mod
      });
    }

    /* 2) upload immagine su Supabase Storage */
    const ext =
      req.file.mimetype === "image/png" ? "png" :
      req.file.mimetype === "image/gif" ? "gif" :
      "jpg";

    const path = `${user_id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(SUPABASE_BUCKET)
      .upload(path, req.file.buffer, {
        contentType: req.file.mimetype || "image/jpeg",
        upsert: false
      });

    if (uploadError) {
      console.error("storage upload error:", uploadError);
      return res.status(500).json({
        ok: false,
        error: "storage_upload_failed",
        details: uploadError.message
      });
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(path);

    const image_url = publicUrlData?.publicUrl;

    if (!image_url) {
      return res.status(500).json({
        ok: false,
        error: "public_url_failed"
      });
    }

    /* 3) insert post */
    const payload = {
      user_id,
      image_url,
      caption: caption.trim(),
      song_title: song_title.trim(),
      song_preview: song_preview.trim(),
      created_at: new Date().toISOString()
    };

    const cleanUsername = safeName(username, "");
    if (cleanUsername) {
      payload.username = cleanUsername;
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("posts")
      .insert([payload])
      .select()
      .single();

    if (insertError) {
      console.error("insert error:", insertError);

      /* best-effort cleanup */
      try {
        await supabaseAdmin.storage.from(SUPABASE_BUCKET).remove([path]);
      } catch (_) {}

      return res.status(500).json({
        ok: false,
        error: "db_insert_failed",
        details: insertError.message
      });
    }

    return res.json({
      ok: true,
      post: inserted,
      moderation: mod
    });
  } catch (err) {
    console.error("create-post error:", err);
    return res.status(500).json({
      ok: false,
      error: "server_error",
      details: err.message
    });
  }
});

/* =========================
   OPTIONAL: MODERATE TEXT ONLY
========================= */
app.post("/moderate-text", async (req, res) => {
  try {
    const { text = "" } = req.body || {};

    if (!String(text).trim()) {
      return res.status(400).json({
        ok: false,
        flagged: true,
        reason: "text_required"
      });
    }

    const response = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: [
        {
          type: "text",
          text: String(text)
        }
      ]
    });

    const result = response.results?.[0];

    if (!result) {
      return res.status(200).json({
        ok: false,
        flagged: true,
        reason: "no moderation result"
      });
    }

    return res.json({
      ok: !result.flagged,
      flagged: result.flagged === true,
      categories: result.categories || {},
      scores: result.category_scores || {},
      appliedInputTypes: result.category_applied_input_types || {}
    });
  } catch (err) {
    console.error("moderate-text error:", err);
    return res.status(200).json({
      ok: false,
      flagged: true,
      reason: "moderation error",
      error: err.message
    });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
