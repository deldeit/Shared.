import express from "express";
import multer from "multer";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* HEALTH CHECK (IMPORTANTE PER RENDER) */
app.get("/", (req,res)=>{
  res.json({ ok:true });
});

/* MODERATION ENDPOINT */
app.post("/moderate", upload.single("file"), async (req,res)=>{
  try{

    if(!req.file){
      return res.json({ ok:false, error:"no file" });
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

    const flagged = response.results?.[0]?.flagged;

    return res.json({ ok: !flagged });

  }catch(err){
    console.error(err);
    return res.json({ ok:false, error:"server error" });
  }
});

/* IMPORTANT: Render PORT */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
