import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const app = express();

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.get("/", (req, res) => {
  res.send("API online");
});

app.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const { data: existing } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", email);

    if (existing && existing.length > 0) {
      return res.json({ message: "Email già registrata" });
    }

    const { data, error } = await supabase
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
      console.log(error);
      return res.json({ message: "Errore Supabase" });
    }

    res.json({ message: "OK", data });

  } catch (err) {
    console.log("SERVER ERROR:", err);
    res.status(500).json({ message: "Server crash" });
  }
});

app.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", email)
      .eq("password", password);

    if (!data || data.length === 0) {
      return res.json({ message: "Credenziali errate" });
    }

    res.json({ message: "Login OK", user: data[0] });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
