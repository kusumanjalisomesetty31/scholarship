const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Ensure base uploads directory exists
const baseUploadsDir = path.join(__dirname, '..', 'uploads');
const publicUploadsDir = path.join(__dirname, '../public/uploads');

if (!fs.existsSync(baseUploadsDir)) {
  fs.mkdirSync(baseUploadsDir, { recursive: true });
}

if (!fs.existsSync(publicUploadsDir)) {
  fs.mkdirSync(publicUploadsDir, { recursive: true });
}

// Your existing storage logic with dynamic folder creation
const dynamicStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const fullName = req.body.fullname.replace(/\s+/g, '_'); // sanitize folder name
    const dir = path.join(__dirname, '..', 'uploads', fullName);
    
    // Create folder if not exists
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '_' + file.originalname);
  }
});

// Profile storage for general profile uploads (used by profile update)
const profileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, publicUploadsDir);
  },
  filename: function (req, file, cb) {
    // Create unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer instances
const dynamicUpload = multer({ 
  storage: dynamicStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept all common document and image types
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDFs, and documents are allowed!'), false);
    }
  }
});

const profileUpload = multer({ 
  storage: profileStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for profile uploads
  },
  fileFilter: function (req, file, cb) {
    // Accept images and PDFs for profile
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDF files are allowed for profile uploads!'), false);
    }
  }
});

// Your existing upload route
router.post('/upload', dynamicUpload.single('doc'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }
    
    res.send(`<h3>✅ Document uploaded successfully by ${req.body.fullname}</h3><a href="/upload.html">Upload More</a>`);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).send('Failed to upload file: ' + error.message);
  }
});

// Enhanced upload route with JSON response
router.post('/upload-json', dynamicUpload.single('doc'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const relativePath = path.relative(path.join(__dirname, '..'), req.file.path);
    
    res.json({
      success: true,
      message: `Document uploaded successfully by ${req.body.fullname}`,
      file: {
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: '/' + relativePath.replace(/\\/g, '/'), // Convert to web path
        size: req.file.size,
        mimetype: req.file.mimetype,
        uploadedBy: req.body.fullname
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload file',
      details: error.message
    });
  }
});

// Profile upload route (for profile photos and documents)
router.post('/profile-upload', profileUpload.single('document'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    
    res.json({
      success: true,
      message: 'Profile file uploaded successfully',
      file: {
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: fileUrl,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Profile upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload profile file',
      details: error.message
    });
  }
});

// Multiple files upload route (using your dynamic storage)
router.post('/upload-multiple', dynamicUpload.array('docs', 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    const uploadedFiles = req.files.map(file => {
      const relativePath = path.relative(path.join(__dirname, '..'), file.path);
      return {
        originalName: file.originalname,
        filename: file.filename,
        path: '/' + relativePath.replace(/\\/g, '/'),
        size: file.size,
        mimetype: file.mimetype
      };
    });
    
    res.json({
      success: true,
      message: `${req.files.length} files uploaded successfully by ${req.body.fullname}`,
      files: uploadedFiles,
      uploadedBy: req.body.fullname
    });
  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload files',
      details: error.message
    });
  }
});

// List files for a specific user
router.get('/files/:fullname', (req, res) => {
  try {
    const fullName = req.params.fullname.replace(/\s+/g, '_');
    const userDir = path.join(__dirname, '..', 'uploads', fullName);
    
    if (!fs.existsSync(userDir)) {
      return res.json({
        success: true,
        files: [],
        message: 'No files found for this user'
      });
    }
    
    const files = fs.readdirSync(userDir).map(filename => {
      const filePath = path.join(userDir, filename);
      const stats = fs.statSync(filePath);
      const relativePath = path.relative(path.join(__dirname, '..'), filePath);
      
      return {
        filename: filename,
        path: '/' + relativePath.replace(/\\/g, '/'),
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      };
    });
    
    res.json({
      success: true,
      files: files,
      count: files.length
    });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list files',
      details: error.message
    });
  }
});

// Delete file route
router.delete('/delete/:fullname/:filename', (req, res) => {
  try {
    const { fullname, filename } = req.params;
    const sanitizedFullName = fullname.replace(/\s+/g, '_');
    const filePath = path.join(__dirname, '..', 'uploads', sanitizedFullName, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
    
    // Delete the file
    fs.unlinkSync(filePath);
    
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete file',
      details: error.message
    });
  }
});

// Get file info route
router.get('/file-info/:fullname/:filename', (req, res) => {
  try {
    const { fullname, filename } = req.params;
    const sanitizedFullName = fullname.replace(/\s+/g, '_');
    const filePath = path.join(__dirname, '..', 'uploads', sanitizedFullName, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
    
    const stats = fs.statSync(filePath);
    const relativePath = path.relative(path.join(__dirname, '..'), filePath);
    
    res.json({
      success: true,
      file: {
        filename: filename,
        path: '/' + relativePath.replace(/\\/g, '/'),
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        owner: fullname
      }
    });
  } catch (error) {
    console.error('File info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get file info',
      details: error.message
    });
  }
});

// Profile-specific file deletion (for public uploads)
router.delete('/profile-delete/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(publicUploadsDir, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
    
    // Delete the file
    fs.unlinkSync(filePath);
    
    res.json({
      success: true,
      message: 'Profile file deleted successfully'
    });
  } catch (error) {
    console.error('Profile delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete profile file',
      details: error.message
    });
  }
});

// Get all uploaded files (admin route)
router.get('/all-files', (req, res) => {
  try {
    const allFiles = [];
    const usersDir = path.join(__dirname, '..', 'uploads');
    
    if (!fs.existsSync(usersDir)) {
      return res.json({
        success: true,
        files: [],
        message: 'No uploads directory found'
      });
    }
    
    const userFolders = fs.readdirSync(usersDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    userFolders.forEach(userFolder => {
      const userDir = path.join(usersDir, userFolder);
      const files = fs.readdirSync(userDir);
      
      files.forEach(filename => {
        const filePath = path.join(userDir, filename);
        const stats = fs.statSync(filePath);
        const relativePath = path.relative(path.join(__dirname, '..'), filePath);
        
        allFiles.push({
          filename: filename,
          path: '/' + relativePath.replace(/\\/g, '/'),
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          owner: userFolder.replace(/_/g, ' ')
        });
      });
    });
    
    res.json({
      success: true,
      files: allFiles,
      count: allFiles.length,
      users: userFolders.length
    });
  } catch (error) {
    console.error('All files error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get all files',
      details: error.message
    });
  }
});

// Health check endpoint
router.get('/upload-status', (req, res) => {
  try {
    const baseExists = fs.existsSync(baseUploadsDir);
    const publicExists = fs.existsSync(publicUploadsDir);
    
    res.json({
      success: true,
      status: 'Upload service is running',
      directories: {
        baseUploads: {
          path: baseUploadsDir,
          exists: baseExists
        },
        publicUploads: {
          path: publicUploadsDir,
          exists: publicExists
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Upload service error',
      details: error.message
    });
  }
});

module.exports = router;
