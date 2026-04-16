import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.get("/", (req, res) => {
  res.send("API Shared online");
});

app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;

  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("email", email)
    .single();

  if (existing) {
    return res.json({ message: "Email già registrata" });
  }

  const { error } = await supabase
    .from("profiles")
    .insert([
      {
        id: crypto.randomUUID(),
        username,
        email,
        password
      }
    ]);

  if (error) {
    return res.json({ message: "Errore signup", error });
  }

  res.json({ message: "Registrazione completata" });
});

app.post("/signin", async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("email", email)
    .eq("password", password)
    .single();

  if (error || !data) {
    return res.json({ message: "Credenziali errate" });
  }

  res.json({ message: "Login ok", user: data });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
