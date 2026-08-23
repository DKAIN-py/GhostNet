import express from "express";

export function createChatRouter() {
  const router = express.Router();

  router.post("/api/chat", async (req, res) => {
    const { message } = req.body;

    try {
      const response = await fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Chat service unavailable" });
    }
  });

  return router;
}

export default createChatRouter;
