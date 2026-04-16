app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;

  console.log("SIGNUP REQUEST:", req.body);

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
    ])
    .select();

  if (error) {
    console.log("SUPABASE ERROR:", error);
    return res.json({ message: "Errore insert", error });
  }

  console.log("INSERT OK:", data);

  res.json({ message: "Registrazione completata", data });
});
