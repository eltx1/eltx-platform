const express = require('express');
const { body, validationResult } = require('express-validator');
const { ConvertService } = require('../services/convertService');

function createConvertRouter(pool) {
  const router = express.Router();
  const service = new ConvertService(pool);

  const validate = (rules) => [
    ...rules,
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ ok: false, errors: errors.array() });
      return next();
    },
  ];

  router.get('/assets', (req, res) => {
    res.json({ ok: true, assets: ['gold', 'stocks', 'crypto'] });
  });

  router.post('/quote', validate([
    body('amountIn').isFloat({ gt: 0 }),
    body('fromAsset').isIn(['gold', 'stocks', 'crypto']),
    body('toAsset').isIn(['gold', 'stocks', 'crypto']),
  ]), async (req, res, next) => {
    try {
      const data = await service.getQuote(req.body.amountIn, req.body.fromAsset, req.body.toAsset);
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/execute', validate([
    body('userId').isInt({ min: 1 }),
    body('amountIn').isFloat({ gt: 0 }),
    body('fromAsset').isIn(['gold', 'stocks', 'crypto']),
    body('toAsset').isIn(['gold', 'stocks', 'crypto']),
    body('slippageBps').optional().isInt({ min: 1, max: 2000 }),
  ]), async (req, res, next) => {
    try {
      const data = await service.executeConvert(req.body.userId, req.body.amountIn, req.body.fromAsset, req.body.toAsset, req.body.slippageBps || 100);
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createConvertRouter };
