require('dotenv').config();
const mongoose = require('mongoose');
const express = require('express');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const cors = require('cors');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const app = express();

// Validate required environment variables
if (!process.env.MONGODB_URI) {
  console.error('Error: MONGODB_URI environment variable is required');
  process.exit(1);
}

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Middleware Configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(express.json());

// Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'feedbackSecretKey',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// File Upload Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only images (JPEG, PNG, GIF) and PDF files are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Schemas
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  mobile: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  profile: {
    fullName: String,
    phone: String,
    dateOfBirth: Date,
    gender: { type: String, enum: ['Male', 'Female', 'Other', 'Prefer not to say'] },
    category: { type: String, enum: ['General', 'OBC', 'SC', 'ST', 'EWS'] },
    currentEducation: String,
    fieldOfStudy: String,
    institution: String,
    cgpa: String,
    achievements: String,
    familyIncome: String,
    parentOccupation: String,
    scholarshipTypes: [String],
    careerGoals: String,
    profilePhoto: String,
    marksheet: String,
    isProfileComplete: { type: Boolean, default: false },
    profileCompletionPercentage: { type: Number, default: 0, min: 0, max: 100 },
    lastUpdated: { type: Date, default: Date.now }
  }
}, { timestamps: true });

const scholarshipSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  provider: { type: String, required: true },
  amount: { type: String, required: true },
  eligibilityCriteria: {
    minCgpa: { type: Number, default: 0, min: 0, max: 10 },
    maxCgpa: { type: Number, default: 10, min: 0, max: 10 },
    requiredEducation: [{ type: String }],
    requiredFields: [{ type: String }],
    maxFamilyIncome: { type: Number, default: 999999999 },
    minFamilyIncome: { type: Number, default: 0 },
    allowedGenders: [{ type: String }],
    allowedCategories: [{ type: String }],
    minAge: { type: Number, default: 0 },
    maxAge: { type: Number, default: 100 },
    allowedStates: [{ type: String }],
    allowedCities: [{ type: String }]
  },
  applicationDeadline: { type: Date, required: true },
  applicationStartDate: { type: Date, default: Date.now },
  documentsRequired: [{ type: String }],
  applicationProcess: String,
  contactInfo: {
    email: String,
    phone: String,
    website: String
  },
  isActive: { type: Boolean, default: true },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const feedbackSchema = new mongoose.Schema({
  email: { type: String, required: true },
  responses: {
    q1: { type: String, required: true },
    q2: { type: String, required: true },
    q3: { type: String, required: true },
    q4: { type: String, required: true },
    suggestions: { type: String }
  },
  timestamp: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', userSchema);
const Scholarship = mongoose.model('Scholarship', scholarshipSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);

// Utility Functions
const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return 0;
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

const parseIncome = (incomeString) => {
  if (!incomeString) return 0;
  const cleanIncome = incomeString.replace(/[₹,\s]/g, '');
  
  if (cleanIncome.includes('-')) {
    const range = cleanIncome.split('-');
    const lower = parseFloat(range[0]);
    const upper = parseFloat(range[1]);
    return (lower + upper) / 2;
  }
  
  if (cleanIncome.toLowerCase().includes('lakh')) {
    return parseFloat(cleanIncome.replace(/[^\d.]/g, '')) * 100000;
  }
  
  if (cleanIncome.toLowerCase().includes('crore')) {
    return parseFloat(cleanIncome.replace(/[^\d.]/g, '')) * 10000000;
  }
  
  return parseFloat(cleanIncome) || 0;
};

// Middleware
const authenticateAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const admin = await User.findOne({ 
      _id: decoded._id, 
      role: 'admin' 
    });

    if (!admin) {
      return res.status(403).json({ 
        success: false,
        message: 'Admin access required' 
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    res.status(401).json({ 
      success: false,
      message: 'Invalid or expired token' 
    });
  }
};

const authenticateUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findOne({ 
      _id: decoded._id
    });

    if (!user) {
      return res.status(403).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ 
      success: false,
      message: 'Invalid or expired token' 
    });
  }
};

// Scholarship Controller Functions
const createScholarship = async (req, res) => {
  try {
    const scholarship = new Scholarship({
      ...req.body,
      postedBy: req.user.id
    });
    await scholarship.save();
    res.status(201).json({ success: true, data: scholarship });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

const getScholarships = async (req, res) => {
  try {
    const scholarships = await Scholarship.find().sort({ deadline: 1 });
    res.status(200).json({ success: true, data: scholarships });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const getScholarship = async (req, res) => {
  try {
    const scholarship = await Scholarship.findById(req.params.id);
    if (!scholarship) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    res.status(200).json({ success: true, data: scholarship });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const updateScholarship = async (req, res) => {
  try {
    const scholarship = await Scholarship.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!scholarship) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    res.status(200).json({ success: true, data: scholarship });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

const deleteScholarship = async (req, res) => {
  try {
    const scholarship = await Scholarship.findByIdAndDelete(req.params.id);
    if (!scholarship) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Routes

// Health Check Route (No auth required)
app.get('/api/health', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    res.json({
      success: true,
      database: 'connected',
      userCount: userCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      database: 'disconnected',
      error: error.message
    });
  }
});

// Test Auth Route
app.get('/api/test-auth', authenticateAdmin, async (req, res) => {
  res.json({
    success: true,
    message: 'Authentication working',
    admin: {
      id: req.admin._id,
      name: req.admin.name,
      email: req.admin.email
    }
  });
});

// Scholarship Routes
app.post('/api/scholarships', authenticateUser, createScholarship);
app.get('/api/scholarships', getScholarships);
app.get('/api/scholarships/:id', getScholarship);
app.put('/api/scholarships/:id', authenticateUser, updateScholarship);
app.delete('/api/scholarships/:id', authenticateUser, deleteScholarship);

// Auth Routes
app.post('/register', async (req, res) => {
  try {
    const { name, email, mobile, password } = req.body;
    
    if (!name || !email || !mobile || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ 
      name, 
      email, 
      mobile, 
      password: hashedPassword 
    });

    await user.save();
    res.status(201).json({ message: 'Registration successful' });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { _id: user._id.toString() },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '8h' }
    );

    req.session.user = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    res.json({ 
      message: 'Login successful',
      token,
      user: {
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await User.findOne({ email, role: 'admin' });

    if (!admin) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid admin credentials' 
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid admin credentials' 
      });
    }

    const token = jwt.sign(
      { _id: admin._id.toString(), role: admin.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '8h' }
    );

    res.json({ 
      success: true,
      token,
      admin: {
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: 'Login failed' 
    });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logout successful' });
  });
});

// Profile Routes
app.get('/api/profile/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const user = await User.findOne({ email }).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      success: true,
      profile: user.profile || {},
      basicInfo: {
        name: user.name,
        email: user.email,
        mobile: user.mobile
      }
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/profile/update', upload.fields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'marksheet', maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      email, fullName, phone, dateOfBirth, gender, category,
      currentEducation, fieldOfStudy, institution, cgpa, achievements,
      familyIncome, parentOccupation, scholarshipTypes, careerGoals
    } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let profilePhoto = user.profile?.profilePhoto;
    let marksheet = user.profile?.marksheet;

    if (req.files?.profilePhoto?.[0]) {
      profilePhoto = `/uploads/${req.files.profilePhoto[0].filename}`;
    }
    if (req.files?.marksheet?.[0]) {
      marksheet = `/uploads/${req.files.marksheet[0].filename}`;
    }

    let parsedScholarshipTypes = [];
    if (scholarshipTypes) {
      parsedScholarshipTypes = Array.isArray(scholarshipTypes) ? 
        scholarshipTypes : 
        JSON.parse(scholarshipTypes);
    }

    const requiredFields = [
      fullName, phone, dateOfBirth, gender, category,
      currentEducation, fieldOfStudy, institution, cgpa,
      familyIncome, parentOccupation, careerGoals
    ];
    
    const filledFields = requiredFields.filter(field => field && field.trim() !== '').length;
    const completionPercentage = Math.round((filledFields / requiredFields.length) * 100);

    user.profile = {
      ...user.profile,
      fullName: fullName || user.profile?.fullName,
      phone: phone || user.profile?.phone,
      dateOfBirth: dateOfBirth || user.profile?.dateOfBirth,
      gender: gender || user.profile?.gender,
      category: category || user.profile?.category,
      currentEducation: currentEducation || user.profile?.currentEducation,
      fieldOfStudy: fieldOfStudy || user.profile?.fieldOfStudy,
      institution: institution || user.profile?.institution,
      cgpa: cgpa || user.profile?.cgpa,
      achievements: achievements || user.profile?.achievements,
      familyIncome: familyIncome || user.profile?.familyIncome,
      parentOccupation: parentOccupation || user.profile?.parentOccupation,
      scholarshipTypes: parsedScholarshipTypes.length ? parsedScholarshipTypes : user.profile?.scholarshipTypes,
      careerGoals: careerGoals || user.profile?.careerGoals,
      profilePhoto,
      marksheet,
      isProfileComplete: completionPercentage >= 70,
      profileCompletionPercentage: completionPercentage,
      lastUpdated: new Date()
    };

    if (fullName) user.name = fullName;
    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: user.profile,
      completionPercentage
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ 
      error: 'Failed to update profile',
      details: error.message 
    });
  }
});

// Scholarship Routes (additional)
app.get('/api/scholarships/active', async (req, res) => {
  try {
    const scholarships = await Scholarship.find({ isActive: true })
      .sort({ createdAt: -1 });
      
    res.json({ 
      success: true, 
      scholarships 
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch scholarships'
    });
  }
});

// Eligibility Check Route
app.post('/api/check-eligibility', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.profile?.isProfileComplete) {
      return res.json({
        success: true,
        message: 'Please complete your profile to check eligibility',
        eligibleScholarships: [],
        incompleteProfile: true
      });
    }

    const profile = user.profile;
    const userAge = calculateAge(profile.dateOfBirth);
    const userIncome = parseIncome(profile.familyIncome);
    const userCgpa = parseFloat(profile.cgpa) || 0;

    const scholarships = await Scholarship.find({ isActive: true });
    const eligibilityResults = [];

    for (const scholarship of scholarships) {
      const criteria = scholarship.eligibilityCriteria;
      const checks = [];
      let isEligible = true;

      // CGPA Check
      if (userCgpa < criteria.minCgpa || userCgpa > criteria.maxCgpa) {
        isEligible = false;
        checks.push({
          criterion: 'CGPA',
          required: `${criteria.minCgpa} - ${criteria.maxCgpa}`,
          userValue: userCgpa,
          passed: false
        });
      } else {
        checks.push({
          criterion: 'CGPA',
          required: `${criteria.minCgpa} - ${criteria.maxCgpa}`,
          userValue: userCgpa,
          passed: true
        });
      }

      // Education Level Check
      if (criteria.requiredEducation.length > 0 && 
          !criteria.requiredEducation.includes(profile.currentEducation)) {
        isEligible = false;
        checks.push({
          criterion: 'Education Level',
          required: criteria.requiredEducation.join(', '),
          userValue: profile.currentEducation,
          passed: false
        });
      } else if (criteria.requiredEducation.length > 0) {
        checks.push({
          criterion: 'Education Level',
          required: criteria.requiredEducation.join(', '),
          userValue: profile.currentEducation,
          passed: true
        });
      }

      // Field of Study Check
      if (criteria.requiredFields.length > 0 && 
          !criteria.requiredFields.includes(profile.fieldOfStudy)) {
        isEligible = false;
        checks.push({
          criterion: 'Field of Study',
          required: criteria.requiredFields.join(', '),
          userValue: profile.fieldOfStudy,
          passed: false
        });
      } else if (criteria.requiredFields.length > 0) {
        checks.push({
          criterion: 'Field of Study',
          required: criteria.requiredFields.join(', '),
          userValue: profile.fieldOfStudy,
          passed: true
        });
      }

      // Income Check
      if (userIncome > criteria.maxFamilyIncome || userIncome < criteria.minFamilyIncome) {
        isEligible = false;
        checks.push({
          criterion: 'Family Income',
          required: `₹${criteria.minFamilyIncome.toLocaleString()} - ₹${criteria.maxFamilyIncome.toLocaleString()}`,
          userValue: `₹${userIncome.toLocaleString()}`,
          passed: false
        });
      } else {
        checks.push({
          criterion: 'Family Income',
          required: `₹${criteria.minFamilyIncome.toLocaleString()} - ₹${criteria.maxFamilyIncome.toLocaleString()}`,
          userValue: `₹${userIncome.toLocaleString()}`,
          passed: true
        });
      }

      // Gender Check
      if (criteria.allowedGenders.length > 0 && 
          !criteria.allowedGenders.includes('All') &&
          !criteria.allowedGenders.includes(profile.gender)) {
        isEligible = false;
        checks.push({
          criterion: 'Gender',
          required: criteria.allowedGenders.join(', '),
          userValue: profile.gender,
          passed: false
        });
      } else if (criteria.allowedGenders.length > 0 && !criteria.allowedGenders.includes('All')) {
        checks.push({
          criterion: 'Gender',
          required: criteria.allowedGenders.join(', '),
          userValue: profile.gender,
          passed: true
        });
      }

      // Category Check
      if (criteria.allowedCategories.length > 0 && 
          !criteria.allowedCategories.includes(profile.category)) {
        isEligible = false;
        checks.push({
          criterion: 'Category',
          required: criteria.allowedCategories.join(', '),
          userValue: profile.category,
          passed: false
        });
      } else if (criteria.allowedCategories.length > 0) {
        checks.push({
          criterion: 'Category',
          required: criteria.allowedCategories.join(', '),
          userValue: profile.category,
          passed: true
        });
      }

      // Age Check
      if (userAge < criteria.minAge || userAge > criteria.maxAge) {
        isEligible = false;
        checks.push({
          criterion: 'Age',
          required: `${criteria.minAge} - ${criteria.maxAge} years`,
          userValue: `${userAge} years`,
          passed: false
        });
      } else {
        checks.push({
          criterion: 'Age',
          required: `${criteria.minAge} - ${criteria.maxAge} years`,
          userValue: `${userAge} years`,
          passed: true
        });
      }

      // Deadline Check
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
        isEligible,
        deadlineStatus,
        eligibilityChecks: checks,
        matchPercentage: Math.round((checks.filter(c => c.passed).length / checks.length) * 100)
      });
    }

    eligibilityResults.sort((a, b) => {
      if (a.isEligible && !b.isEligible) return -1;
      if (!a.isEligible && b.isEligible) return 1;
      return b.matchPercentage - a.matchPercentage;
    });

    res.json({
      success: true,
      totalScholarships: scholarships.length,
      eligibleScholarships: eligibilityResults.filter(r => r.isEligible).length,
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Feedback Routes
app.post('/api/feedback', async (req, res) => {
  try {
    const { email, responses } = req.body;

    if (!email || !responses) {
      return res.status(400).json({ 
        success: false,
        message: "Email and responses are required" 
      });
    }

    const requiredQuestions = ['q1', 'q2', 'q3', 'q4'];
    const missingQuestions = requiredQuestions.filter(q => !responses[q]);
    
    if (missingQuestions.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: `Please answer all required questions: ${missingQuestions.join(', ')}`
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    const newFeedback = await Feedback.create({ 
      email,
      responses: {
        q1: responses.q1,
        q2: responses.q2,
        q3: responses.q3,
        q4: responses.q4,
        suggestions: responses.suggestions || ''
      }
    });
    
    res.json({ 
      success: true,
      message: "Thank you for your feedback!",
      feedback: newFeedback
    });
  } catch (err) {
    console.error("Error submitting feedback:", err);
    res.status(500).json({ 
      success: false,
      message: "Internal server error" 
    });
  }
});

app.get('/api/admin/feedback', async (req, res) => {
  try {
    const feedbackList = await Feedback.find().sort({ timestamp: -1 });
    
    const calculateStats = (question) => {
      const stats = {};
      feedbackList.forEach(feedback => {
        const response = feedback.responses[question];
        stats[response] = (stats[response] || 0) + 1;
      });
      return stats;
    };

    res.json({
      success: true,
      feedback: feedbackList,
      stats: {
        q1: calculateStats('q1'),
        q2: calculateStats('q2'),
        q3: calculateStats('q3'),
        q4: calculateStats('q4'),
        totalResponses: feedbackList.length
      }
    });
  } catch (err) {
    console.error("Error fetching feedback:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch feedback"
    });
  }
});

app.get('/api/admin/feedback-stats', async (req, res) => {
  try {
    const feedbackList = await Feedback.find();
    
    const calculatePercentages = (question) => {
      const stats = {};
      feedbackList.forEach(feedback => {
        const response = feedback.responses[question];
        stats[response] = (stats[response] || 0) + 1;
      });
      
      return Object.entries(stats).map(([option, count]) => ({
        option,
        count,
        percentage: Math.round((count / feedbackList.length) * 100)
      }));
    };

    res.json({
      success: true,
      stats: {
        totalResponses: feedbackList.length,
        questions: [
          {
            id: 'q1',
            text: 'Overall experience with our scholarship portal',
            options: calculatePercentages('q1')
          },
          {
            id: 'q2',
            text: 'Ease of finding relevant scholarships',
            options: calculatePercentages('q2')
          },
          {
            id: 'q3',
            text: 'Satisfaction with scholarship matching results',
            options: calculatePercentages('q3')
          },
          {
            id: 'q4',
            text: 'Likelihood to recommend our portal',
            options: calculatePercentages('q4')
          }
        ]
      }
    });
  } catch (err) {
    console.error("Error fetching feedback stats:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch feedback statistics"
    });
  }
});

// Admin Dashboard Routes
app.get('/api/admin/scholarship-stats', authenticateAdmin, async (req, res) => {
  try {
    const total = await Scholarship.countDocuments();
    const active = await Scholarship.countDocuments({ isActive: true });
    const expired = await Scholarship.countDocuments({
      applicationDeadline: { $lt: new Date() }
    });
    
    const providerStats = await Scholarship.aggregate([
      { $group: { _id: '$provider', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      stats: {
        total,
        active,
        expired,
        byProvider: providerStats
      }
    });
  } catch (error) {
    console.error('Error fetching scholarship stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

app.get('/api/admin/profile-stats', authenticateAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const completeProfiles = await User.countDocuments({ 'profile.isProfileComplete': true });
    const incompleteProfiles = totalUsers - completeProfiles;

    const completionStats = await User.aggregate([
      { $match: { 'profile.profileCompletionPercentage': { $exists: true } } },
      {
        $bucket: {
          groupBy: '$profile.profileCompletionPercentage',
          boundaries: [0, 25, 50, 75, 100],
          default: 'Other',
          output: { count: { $sum: 1 } }
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        completeProfiles,
        incompleteProfiles,
        completionPercentage: Math.round((completeProfiles / totalUsers) * 100),
        distributionByCompletion: completionStats
      }
    });
  } catch (error) {
    console.error('Error fetching profile stats:', error);
    res.status(500).json({ error: 'Failed to fetch profile statistics' });
  }
});

// FIXED - Single Users Route (removed duplicates)


// Debug route for testing database connection

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    message: err.message 
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Endpoint not found' 
  });
});
app.get('/api/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});


// Database Connection Events
mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connected');
});

mongoose.connection.on('error', (err) => {
  console.log('❌ MongoDB error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('❌ MongoDB disconnected');
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 File upload directory: ${uploadDir}`);
  console.log('🎓 Scholarship system ready!');
  console.log('🔧 Available admin routes:');
  console.log('   - GET /api/health - System health check');
  console.log('   - GET /api/test-auth - Test admin authentication');
  console.log('   - GET /api/users - View all registered users');
  console.log('   - GET /api/debug/users - Debug user data');
  console.log('   - GET /api/scholarships - View all scholarships');
  console.log('   - GET /api/admin/scholarship-stats - View scholarship statistics');
  console.log('   - GET /api/admin/profile-stats - View user statistics');
  console.log('   - GET /api/admin/feedback - View feedback responses');
  console.log('   - GET /api/admin/feedback-stats - View feedback statistics');
});