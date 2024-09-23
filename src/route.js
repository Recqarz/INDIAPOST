import express from 'express';
import { extractCaptcha, getData, trackConsignment } from './controller.js';

const router = express.Router();

// GET route
router.get('/dummy-get', getData);

// POST route for creating item (using Puppeteer)
router.post('/trackConsignment', trackConsignment);
router.post('/extractCaptchaText', extractCaptcha);

export default router;
