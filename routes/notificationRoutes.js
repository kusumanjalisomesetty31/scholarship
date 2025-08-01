const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateAdmin } = require('../middleware/auth');

// Send notification to all users
router.post('/api/notifications/send', authenticateAdmin, async (req, res) => {
  try {
    const { title, message, sendEmail } = req.body;

    // Get all user emails if email notification requested
    const recipients = sendEmail ? 
      await User.find().select('email') : 
      [];

    // In a real app, you would:
    // 1. Save to database
    // 2. Send emails (using Nodemailer)
    // 3. Push to mobile apps (Firebase Cloud Messaging)

    res.json({
      success: true,
      message: 'Notification sent successfully',
      stats: {
        totalUsers: recipients.length,
        emailSent: sendEmail,
        notificationId: Date.now().toString()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send notification'
    });
  }
});

module.exports = router;
