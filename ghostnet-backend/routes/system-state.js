const express = require('express');
const router = express.Router();
const { store } = require('../store/memory');

// Endpoint for Cascade Detector to fetch the unified array matrix
router.get('/', (req, res) => {
    // Transform our state object map back into a raw array contract for the Python engine
    const stateArray = Object.values(store.currentSystemState);
    
    console.log('🔄 [STATE POLL] Cascade Detector reading system metrics matrix...');
    res.status(200).json(stateArray);
});

module.exports = router;
