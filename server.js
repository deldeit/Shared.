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

/* moderation endpoint */
app.post("/moderate", upload.single("file"), async (req,res)=>{
  try{

    if(!req.file){
      return res.json({ ok:false });
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

    if(flagged){
      return res.json({ ok:false });
    }

    res.json({ ok:true });

  }catch(err){
    console.error(err);
    res.json({ ok:false });
  }
});

app.listen(3000,()=>console.log("Server running"));
