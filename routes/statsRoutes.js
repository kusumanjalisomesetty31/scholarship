const express = require('express');
const router = express.Router();
const { Scholarship, User, Application } = require('../models');
const { authenticateAdmin } = require('../middleware/auth');

// Get all statistics
router.get('/api/stats/dashboard', authenticateAdmin, async (req, res) => {
  try {
    // Count scholarships
    const totalScholarships = await Scholarship.countDocuments();
    const activeScholarships = await Scholarship.countDocuments({ 
      applicationDeadline: { $gte: new Date() } 
    });

    // Count users
    const totalUsers = await User.countDocuments();
    const usersWithCompleteProfiles = await User.countDocuments({ 
      'profile.isProfileComplete': true 
    });

    // Application stats
    const totalApplications = await Application.countDocuments();
    const applicationsLastMonth = await Application.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30*24*60*60*1000) }
    });

    // Scholarship by provider
    const scholarshipsByProvider = await Scholarship.aggregate([
      { $group: { _id: '$provider', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      success: true,
      stats: {
        scholarships: {
          total: totalScholarships,
          active: activeScholarships,
          expired: totalScholarships - activeScholarships,
          byProvider: scholarshipsByProvider
        },
        users: {
          total: totalUsers,
          withProfile: usersWithCompleteProfiles,
          withoutProfile: totalUsers - usersWithCompleteProfiles
        },
        applications: {
          total: totalApplications,
          lastMonth: applicationsLastMonth,
          monthlyTrend: await getMonthlyTrend()
        }
      }
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Failed to load statistics' 
    });
  }
});

// Helper: Get monthly application trend
async function getMonthlyTrend() {
  const months = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    months.push({
      name: date.toLocaleString('default', { month: 'short' }),
      year: date.getFullYear()
    });
  }

  return Promise.all(months.map(async month => {
    const start = new Date(month.year, new Date(`${month.name} 1, ${month.year}`).getMonth(), 1);
    const end = new Date(month.year, start.getMonth() + 1, 0);
    
    const count = await Application.countDocuments({
      createdAt: { $gte: start, $lte: end }
    });

    return { ...month, count };
  }));
}

module.exports = router;
