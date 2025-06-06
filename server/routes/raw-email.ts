import { Router } from 'express';

const router = Router();

// Completely raw email endpoint with no validation whatsoever
router.post('/:id/raw-email', async (req, res) => {
  try {
    const orderId = req.params.id;
    const body = req.body;
    
    console.log('[RawEmail] Raw request received:', {
      orderId,
      body: JSON.stringify(body, null, 2)
    });

    // No validation, no schemas, no parsing - just log and return success
    const result = {
      success: true,
      message: 'Raw email processed successfully',
      orderId,
      timestamp: new Date().toISOString(),
      receivedData: body
    };

    console.log('[RawEmail] Sending response:', result);
    
    res.json(result);

  } catch (error) {
    console.error('[RawEmail] Raw error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Raw server error',
      message: String(error)
    });
  }
});

export default router;