const mongoose = require('mongoose');

const ScholarshipSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  deadline: { type: Date, required: true },
  amount: { type: Number, required: true },
  eligibility: { type: String, required: true },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Admin who created it
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Scholarship', ScholarshipSchema);
