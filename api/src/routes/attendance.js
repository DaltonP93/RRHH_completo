const router = require('express').Router();
const { authenticate, authorize, authenticateServiceKey } = require('../middleware/auth');
const {
  getDashboardStats, getByDate, registerManual, registerMobile,
  bridgeWebhook
} = require('../controllers/attendanceController');

// Endpoint para el Bridge ZKTeco (clave interna, sin JWT)
router.post('/bridge/webhook', authenticateServiceKey, bridgeWebhook);

router.use(authenticate);

router.get('/live',  getDashboardStats);   // estado actual del día — KPIs + últimos marcajes
router.get('/',                getByDate);            // ?date=&dept=&employeeId=
router.post('/manual',         authorize('admin','hr'), registerManual);
router.post('/mobile',         registerMobile);       // marcaje desde app

// Recalcular daily_summary en bloque para una fecha (admin)
router.post('/recalc-summary', authorize('admin','super_admin'), async (req, res) => {
  try {
    const { bulkRecalcDailySummary, pyDateStr } = require('../services/scheduler');
    const date = req.body.date || pyDateStr(new Date());
    await bulkRecalcDailySummary(date);
    res.json({ ok: true, date, message: `daily_summary recalculado para ${date}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
