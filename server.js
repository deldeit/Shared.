import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Shared backend is running");
});

app.post("/ping", (req, res) => {
  res.json({ ok: true });
});

app.listen(3000, () => console.log("Server ON"));