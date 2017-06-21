const express = require('express');

const router = express.Router();

router.get('/hello', (req, res) => res.json({ hello: 1000 }));
router.get('/hi', (req, res) => res.json({ hi: 2 }));

module.exports = router;
