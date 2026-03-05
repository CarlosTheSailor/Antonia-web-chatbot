const express = require('express');
const { postChat } = require('../controllers/chatController');
const { postLead } = require('../controllers/leadController');
const { getPublic } = require('../controllers/configController');
const { postSmokeBookingGuest } = require('../controllers/aimharderController');

const router = express.Router();

router.post('/chat', postChat);
router.post('/lead', postLead);
router.post('/aimharder/smoke-booking-guest', postSmokeBookingGuest);
router.get('/config/public', getPublic);

module.exports = router;
