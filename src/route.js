import express from 'express';
import { extractCaptcha, getData, trackConsignment, trackConsignmentForInitiatedData } from './controller.js';

const router = express.Router();

router.get('/dummy-get', getData);
router.post('/trackConsignment', trackConsignment);
router.post('/trackConsignmentForInitiatedData', trackConsignmentForInitiatedData);
router.post('/extractCaptchaText', extractCaptcha);

export default router;
