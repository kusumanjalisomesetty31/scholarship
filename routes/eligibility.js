const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Scholarship Schema for storing scholarship criteria
const scholarshipSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  provider: String,
  amount: String,
  
  // Eligibility Criteria
  eligibilityCriteria: {
    // Academic Criteria
    minCgpa: { type: Number, default: 0 },
    maxCgpa: { type: Number, default: 10 },
    requiredEducation: [String], // ["Undergraduate", "Postgraduate", "PhD"]
    requiredFields: [String], // ["Engineering", "Medicine", "Arts", etc.]
    
    // Financial Criteria
    maxFamilyIncome: { type: Number, default: 999999999 },
    minFamilyIncome: { type: Number, default: 0 },
    
    // Personal Criteria
    allowedGenders: [String], // ["Male", "Female", "Other", "All"]
    allowedCategories: [String], // ["General", "OBC", "SC", "ST", "EWS"]
    
    // Age Criteria
    minAge: { type: Number, default: 0 },
    maxAge: { type: Number, default: 100 },
    
    // Location Criteria (optional)
    allowedStates: [String],
    allowedCities: [String]
  },
  
  // Application Details
  applicationDeadline: Date,
  applicationStartDate: Date,
  documentsRequired: [String],
  applicationProcess: String,
  contactInfo: {
    email: String,
    phone: String,
    website: String
  },
  
  // Status
  isActive: { type: Boolean, default: true },
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Scholarship = mongoose.model('Scholarship', scholarshipSchema);

// User Schema (assuming you want to reference it)
const User = mongoose.model('User');

// Utility function to calculate age from date of birth
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return 0;
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// Utility function to parse family income
function parseIncome(incomeString) {
  if (!incomeString) return 0;
  
  // Remove currency symbols and commas
  const cleanIncome = incomeString.replace(/[₹,\s]/g, '');
  
  // Handle ranges like "5-10 lakhs"
  if (cleanIncome.includes('-')) {
    const range = cleanIncome.split('-');
    const lower = parseFloat(range[0]);
    const upper = parseFloat(range[1]);
    return (lower + upper) / 2; // Take average of range
  }
  
  // Handle "lakhs" and "crores"
  if (cleanIncome.toLowerCase().includes('lakh')) {
    const num = parseFloat(cleanIncome.replace(/[^\d.]/g, ''));
    return num * 100000;
  }
  
  if (cleanIncome.toLowerCase().includes('crore')) {
    const num = parseFloat(cleanIncome.replace(/[^\d.]/g, ''));
    return num * 10000000;
  }
  
  // Return as number
  return parseFloat(cleanIncome) || 0;
}

// Route to check eligibility for a specific user
router.post('/check-eligibility', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email is required' 
      });
    }

    // Find user with profile data
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Check if profile is complete enough for eligibility check
    if (!user.profile || !user.profile.isProfileComplete) {
      return res.json({
        success: true,
        message: 'Please complete your profile to check eligibility',
        eligibleScholarships: [],
        incompleteProfile: true
      });
    }

    const profile = user.profile;
    
    // Get user's details for eligibility checking
    const userAge = calculateAge(profile.dateOfBirth);
    const userIncome = parseIncome(profile.familyIncome);
    const userCgpa = parseFloat(profile.cgpa) || 0;

    // Get all active scholarships
    const allScholarships = await Scholarship.find({ isActive: true });
    
    const eligibilityResults = [];

    for (let scholarship of allScholarships) {
      const criteria = scholarship.eligibilityCriteria;
      const eligibilityChecks = [];
      let isEligible = true;

      // Check CGPA
      if (userCgpa < criteria.minCgpa || userCgpa > criteria.maxCgpa) {
        isEligible = false;
        eligibilityChecks.push({
          criterion: 'CGPA',
          required: `${criteria.minCgpa} - ${criteria.maxCgpa}`,
          userValue: userCgpa,
          passed: false
        });
      } else {
        eligibilityChecks.push({
          criterion: 'CGPA',
          required: `${criteria.minCgpa} - ${criteria.maxCgpa}`,
          userValue: userCgpa,
          passed: true
        });
      }

      // Check Education Level
      if (criteria.requiredEducation.length > 0 && 
          !criteria.requiredEducation.includes(profile.currentEducation)) {
        isEligible = false;
        eligibilityChecks.push({
          criterion: 'Education Level',
          required: criteria.requiredEducation.join(', '),
          userValue: profile.currentEducation,
          passed: false
        });
      } else if (criteria.requiredEducation.length > 0) {
        eligibilityChecks.push({
          criterion: 'Education Level',
          required: criteria.requiredEducation.join(', '),
          userValue: profile.currentEducation,
          passed: true
        });
      }

      // Check Field of Study
      if (criteria.requiredFields.length > 0 && 
          !criteria.requiredFields.includes(profile.fieldOfStudy)) {
        isEligible = false;
        eligibilityChecks.push({
          criterion: 'Field of Study',
          required: criteria.requiredFields.join(', '),
          userValue: profile.fieldOfStudy,
          passed: false
        });
      } else if (criteria.requiredFields.length > 0) {
        eligibilityChecks.push({
          criterion: 'Field of Study',
          required: criteria.requiredFields.join(', '),
          userValue: profile.fieldOfStudy,
          passed: true
        });
      }

      // Check Family Income
      if (userIncome > criteria.maxFamilyIncome || userIncome < criteria.minFamilyIncome) {
        isEligible = false;
        eligibilityChecks.push({
          criterion: 'Family Income',
          required: `₹${criteria.minFamilyIncome.toLocaleString()} - ₹${criteria.maxFamilyIncome.toLocaleString()}`,
          userValue: `₹${userIncome.toLocaleString()}`,
          passed: false
        });
      } else {
        eligibilityChecks.push({
          criterion: 'Family Income',
          required: `₹${criteria.minFamilyIncome.toLocaleString()} - ₹${criteria.maxFamilyIncome.toLocaleString()}`,
          userValue: `₹${userIncome.toLocaleString()}`,
          passed: true
        });
      }

      // Check Gender
      if (criteria.allowedGenders.length > 0 && 
          !criteria.allowedGenders.includes('All') &&
          !criteria.allowedGenders.includes(profile.gender)) {
        isEligible = false;
        eligibilityChecks.push({
          criterion: 'Gender',
          required: criteria.allowedGenders.join(', '),
          userValue: profile.gender,
          passed: false
        });
      } else if (criteria.allowedGenders.length > 0 && !criteria.allowedGenders.includes('All')) {
        eligibilityChecks.push({
          criterion: 'Gender',
          required: criteria.allowedGenders.join(', '),
          userValue: profile.gender,
          passed: true
        });
      }

      // Check Category
      if (criteria.allowedCategories.length > 0 && 
          !criteria.allowedCategories.includes(profile.category)) {
        isEligible = false;
        eligibilityChecks.push({
          criterion: 'Category',
          required: criteria.allowedCategories.join(', '),
          userValue: profile.category,
          passed: false
        });
      } else if (criteria.allowedCategories.length > 0) {
        eligibilityChecks.push({
          criterion: 'Category',
          required: criteria.allowedCategories.join(', '),
          userValue: profile.category,
          passed: true
        });
      }

      // Check Age
      if (userAge < criteria.minAge || userAge > criteria.maxAge) {
        isEligible = false;
        eligibilityChecks.push({
          criterion: 'Age',
          required: `${criteria.minAge} - ${criteria.maxAge} years`,
          userValue: `${userAge} years`,
          passed: false
        });
      } else {
        eligibilityChecks.push({
          criterion: 'Age',
          required: `${criteria.minAge} - ${criteria.maxAge} years`,
          userValue: `${userAge} years`,
          passed: true
        });
      }

      // Check Application Deadline
      const now = new Date();
      let deadlineStatus = 'Active';
      if (scholarship.applicationDeadline && scholarship.applicationDeadline < now) {
        deadlineStatus = 'Expired';
        isEligible = false;
      }

      eligibilityResults.push({
        scholarship: {
          id: scholarship._id,
          title: scholarship.title,
          description: scholarship.description,
          provider: scholarship.provider,
          amount: scholarship.amount,
          applicationDeadline: scholarship.applicationDeadline,
          documentsRequired: scholarship.documentsRequired,
          contactInfo: scholarship.contactInfo
        },
        isEligible: isEligible,
        deadlineStatus: deadlineStatus,
        eligibilityChecks: eligibilityChecks,
        matchPercentage: Math.round((eligibilityChecks.filter(check => check.passed).length / eligibilityChecks.length) * 100)
      });
    }

    // Sort by eligibility and match percentage
    eligibilityResults.sort((a, b) => {
      if (a.isEligible && !b.isEligible) return -1;
      if (!a.isEligible && b.isEligible) return 1;
      return b.matchPercentage - a.matchPercentage;
    });

    const eligibleCount = eligibilityResults.filter(result => result.isEligible).length;

    res.json({
      success: true,
      totalScholarships: allScholarships.length,
      eligibleScholarships: eligibleCount,
      results: eligibilityResults,
      userProfile: {
        name: profile.fullName || user.name,
        cgpa: userCgpa,
        education: profile.currentEducation,
        field: profile.fieldOfStudy,
        income: `₹${userIncome.toLocaleString()}`,
        age: userAge,
        gender: profile.gender,
        category: profile.category
      }
    });

  } catch (error) {
    console.error('Error checking eligibility:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Route to get all scholarships (for admin)
router.get('/scholarships', async (req, res) => {
  try {
    const scholarships = await Scholarship.find({}).sort({ createdAt: -1 });
    res.json({
      success: true,
      scholarships: scholarships
    });
  } catch (error) {
    console.error('Error fetching scholarships:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Route to add a new scholarship (for admin)
router.post('/scholarships/add', async (req, res) => {
  try {
    const scholarshipData = req.body;
    const scholarship = new Scholarship(scholarshipData);
    await scholarship.save();
    
    res.json({
      success: true,
      message: 'Scholarship added successfully',
      scholarship: scholarship
    });
  } catch (error) {
    console.error('Error adding scholarship:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to add scholarship',
      details: error.message 
    });
  }
});

// Route to update a scholarship (for admin)
router.put('/scholarships/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body, updatedAt: new Date() };
    
    const scholarship = await Scholarship.findByIdAndUpdate(id, updateData, { new: true });
    
    if (!scholarship) {
      return res.status(404).json({ 
        success: false, 
        error: 'Scholarship not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Scholarship updated successfully',
      scholarship: scholarship
    });
  } catch (error) {
    console.error('Error updating scholarship:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update scholarship',
      details: error.message 
    });
  }
});

// Route to delete a scholarship (for admin)
router.delete('/scholarships/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const scholarship = await Scholarship.findByIdAndDelete(id);
    
    if (!scholarship) {
      return res.status(404).json({ 
        success: false, 
        error: 'Scholarship not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Scholarship deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting scholarship:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete scholarship',
      details: error.message 
    });
  }
});

// Route to seed sample scholarships (for testing)
router.post('/scholarships/seed', async (req, res) => {
  try {
    // Clear existing scholarships
    await Scholarship.deleteMany({});
    
    const sampleScholarships = [
      {
        title: "Merit-Based Engineering Scholarship",
        description: "Scholarship for outstanding engineering students with excellent academic performance",
        provider: "Tech Foundation India",
        amount: "₹50,000 per year",
        eligibilityCriteria: {
          minCgpa: 8.5,
          maxCgpa: 10,
          requiredEducation: ["Undergraduate", "Postgraduate"],
          requiredFields: ["Engineering", "Technology"],
          maxFamilyIncome: 800000,
          allowedGenders: ["All"],
          allowedCategories: ["General", "OBC", "SC", "ST"],
          minAge: 17,
          maxAge: 25
        },
        applicationDeadline: new Date('2024-12-31'),
        documentsRequired: ["Marksheet", "Income Certificate", "Caste Certificate"],
        contactInfo: {
          email: "scholarships@techfoundation.org",
          phone: "+91-9876543210",
          website: "www.techfoundation.org"
        }
      },
      {
        title: "Women in STEM Scholarship",
        description: "Encouraging women to pursue careers in Science, Technology, Engineering, and Mathematics",
        provider: "Women Empowerment Society",
        amount: "₹75,000 per year",
        eligibilityCriteria: {
          minCgpa: 7.5,
          maxCgpa: 10,
          requiredEducation: ["Undergraduate", "Postgraduate"],
          requiredFields: ["Engineering", "Science", "Mathematics", "Technology"],
          maxFamilyIncome: 1000000,
          allowedGenders: ["Female"],
          allowedCategories: ["General", "OBC", "SC", "ST", "EWS"],
          minAge: 18,
          maxAge: 30
        },
        applicationDeadline: new Date('2024-11-30'),
        documentsRequired: ["Marksheet", "Income Certificate", "Identity Proof"],
        contactInfo: {
          email: "apply@womenstem.org",
          phone: "+91-9876543211",
          website: "www.womenstem.org"
        }
      },
      {
        title: "Need-Based General Scholarship",
        description: "Financial assistance for students from economically weaker sections",
        provider: "Education Support Trust",
        amount: "₹30,000 per year",
        eligibilityCriteria: {
          minCgpa: 6.0,
          maxCgpa: 10,
          requiredEducation: ["Undergraduate", "Postgraduate"],
          requiredFields: [], // All fields allowed
          maxFamilyIncome: 300000,
          allowedGenders: ["All"],
          allowedCategories: ["SC", "ST", "OBC", "EWS"],
          minAge: 17,
          maxAge: 28
        },
        applicationDeadline: new Date('2025-01-15'),
        documentsRequired: ["Marksheet", "Income Certificate", "Caste Certificate", "Bank Details"],
        contactInfo: {
          email: "support@edutrust.org",
          phone: "+91-9876543212",
          website: "www.edutrust.org"
        }
      },
      {
        title: "Post Graduate Research Scholarship",
        description: "Support for postgraduate students pursuing research in any field",
        provider: "Research Development Council",
        amount: "₹1,00,000 per year",
        eligibilityCriteria: {
          minCgpa: 8.0,
          maxCgpa: 10,
          requiredEducation: ["Postgraduate", "PhD"],
          requiredFields: [], // All fields
          maxFamilyIncome: 1200000,
          allowedGenders: ["All"],
          allowedCategories: ["General", "OBC", "SC", "ST", "EWS"],
          minAge: 21,
          maxAge: 35
        },
        applicationDeadline: new Date('2024-10-31'),
        documentsRequired: ["Degree Certificate", "Research Proposal", "Income Certificate"],
        contactInfo: {
          email: "research@rdc.gov.in",
          phone: "+91-9876543213",
          website: "www.rdc.gov.in"
        }
      }
    ];

    await Scholarship.insertMany(sampleScholarships);
    
    res.json({
      success: true,
      message: `${sampleScholarships.length} sample scholarships added successfully`,
      count: sampleScholarships.length
    });
  } catch (error) {
    console.error('Error seeding scholarships:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to seed scholarships',
      details: error.message 
    });
  }
});

module.exports = router;
