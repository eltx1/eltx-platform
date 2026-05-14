const express = require('express');
const router = express.Router();
const convertService = require('../services/convertService');

// Simple auth middleware (replace with your real one)
const authenticate = (req, res, next) => {
  // req.user = ... your auth logic
  req.userId = req.body.userId || req.query.userId || 'demo-user';
  next();
};

router.post('/quote', authenticate, async (req, res) => {
  try {
    const { amount, fromAsset, toAsset } = req.body;
    if (!amount || !fromAsset || !toAsset) {
      return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    const quote = await convertService.getQuote(amount, fromAsset, toAsset);
    res.json(quote);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/execute', authenticate, async (req, res) => {
  try {
    const { amount, fromAsset, toAsset } = req.body;
    if (!amount || !fromAsset || !toAsset) {
      return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    const result = await convertService.executeConvert(req.userId, amount, fromAsset, toAsset);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
