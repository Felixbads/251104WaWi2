import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// Debug endpoint to trace exactly where the validation error occurs
router.post('/orders/:id/debug-email', async (req: Request, res: Response) => {
  console.log('[EMAIL-DEBUG] Starting email debug trace');
  
  try {
    const orderId = parseInt(req.params.id);
    const { to, cc, bcc, subject, content } = req.body;

    console.log('[EMAIL-DEBUG] Request parameters:', {
      orderId,
      to: to?.substring(0, 20) + '...',
      cc: cc?.substring(0, 20) + '...',
      subject: subject?.substring(0, 30) + '...',
      contentLength: content?.length
    });

    // Step 1: Basic validation
    console.log('[EMAIL-DEBUG] Step 1: Basic validation');
    if (!to || !subject || !content) {
      console.log('[EMAIL-DEBUG] FAILED - Missing basic fields');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        debug: 'Basic validation failed'
      });
    }
    console.log('[EMAIL-DEBUG] Step 1: PASSED');

    // Step 2: Email format validation
    console.log('[EMAIL-DEBUG] Step 2: Email format validation');
    if (!to.includes('@')) {
      console.log('[EMAIL-DEBUG] FAILED - Invalid email format');
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        debug: 'Email format validation failed'
      });
    }
    console.log('[EMAIL-DEBUG] Step 2: PASSED');

    // Step 3: Database order check
    console.log('[EMAIL-DEBUG] Step 3: Database order check');
    try {
      const orderCheck = await pool.query('SELECT id, status FROM orders WHERE id = $1', [orderId]);
      if (orderCheck.rows.length === 0) {
        console.log('[EMAIL-DEBUG] FAILED - Order not found');
        return res.status(404).json({
          success: false,
          error: 'Order not found',
          debug: 'Database order check failed'
        });
      }
      console.log('[EMAIL-DEBUG] Step 3: PASSED - Order found:', orderCheck.rows[0]);
    } catch (dbError) {
      console.log('[EMAIL-DEBUG] FAILED - Database error:', dbError);
      return res.status(500).json({
        success: false,
        error: 'Database error',
        debug: 'Database order check failed with error'
      });
    }

    // Step 4: Attempt status update (this might reveal where the validation occurs)
    console.log('[EMAIL-DEBUG] Step 4: Status update attempt');
    try {
      const updateResult = await pool.query(
        'UPDATE orders SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *',
        ['sent', new Date(), orderId]
      );
      console.log('[EMAIL-DEBUG] Step 4: PASSED - Status update successful');
    } catch (updateError) {
      console.log('[EMAIL-DEBUG] FAILED - Status update error:', updateError);
      // Continue anyway - this might reveal the source
    }

    // Step 5: Return success with detailed debug info
    console.log('[EMAIL-DEBUG] All steps completed successfully');
    
    res.json({
      success: true,
      message: 'Debug trace completed successfully',
      debug: {
        step1: 'Basic validation - PASSED',
        step2: 'Email format validation - PASSED', 
        step3: 'Database order check - PASSED',
        step4: 'Status update - ATTEMPTED',
        finalNote: 'If you still get validation pattern error, it originates from outside this endpoint'
      },
      simulatedEmail: {
        to,
        cc: cc || null,
        bcc: bcc || null,
        subject,
        contentLength: content.length
      }
    });

  } catch (error) {
    console.error('[EMAIL-DEBUG] Unexpected error:', error);
    
    // Check if this is the mysterious validation pattern error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('string did not match the expected pattern')) {
      console.log('[EMAIL-DEBUG] FOUND THE VALIDATION PATTERN ERROR!');
      console.log('[EMAIL-DEBUG] Error details:', error);
      console.log('[EMAIL-DEBUG] Stack trace:', error instanceof Error ? error.stack : 'No stack');
    }
    
    res.status(500).json({
      success: false,
      error: 'Debug trace failed',
      errorMessage,
      debug: 'Unexpected error during debug trace'
    });
  }
});

export default router;