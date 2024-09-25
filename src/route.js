import express from 'express';
import { extractCaptcha, getData, trackConsignment } from './controller.js';

const router = express.Router();

router.get('/dummy-get', getData);
router.post('/trackConsignment', trackConsignment);
router.post('/extractCaptchaText', extractCaptcha);

export default router;
