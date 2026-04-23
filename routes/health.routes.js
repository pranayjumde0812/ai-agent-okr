const express = require("express");
const { getSystemHealth } = require("../services/health.service");

const router = express.Router();

router.get("/", async (req, res) => {
  const health = await getSystemHealth();
  res.status(health.ok ? 200 : 503).json(health);
});

module.exports = router;
