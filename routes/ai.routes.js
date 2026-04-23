const express = require("express");
const { handleAI } = require("../controllers/ai.controller");

const router = express.Router();

router.post("/", handleAI);

module.exports = router;
