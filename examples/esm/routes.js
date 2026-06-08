import express from 'express';
import child from './child.js'

const router = express.Router();

export const a = `${124433} === ${child}`;

router.get('/', (req, res) => res.json({ hello:  a }));
router.get('/hello', (req, res) => res.json({ hi: 2 }));

export default router;
