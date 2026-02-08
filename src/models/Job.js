const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters']
    },
    language: {
      type: String,
      required: [true, 'Language is required'],
      trim: true
    },
    proficiencyLevel: {
      type: String,
      required: [true, 'Proficiency level is required'],
      enum: {
        values: ['Basic', 'Intermediate', 'Advanced', 'Native'],
        message: '{VALUE} is not a valid proficiency level'
      }
    },
    jobType: {
      type: String,
      required: [true, 'Job type is required'],
      enum: {
        values: [
          'translation',
          'teaching',
          'interpretation',
          'content',
          'assistance',
          'research',
          'other'
        ],
        message: '{VALUE} is not a valid job type'
      }
    },
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      maxlength: [150, 'Company name cannot exceed 150 characters']
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true
    },
    isRemote: {
      type: Boolean,
      default: false
    },
    description: {
      type: String,
      required: [true, 'Job description is required'],
      trim: true,
      minlength: [50, 'Description must be at least 50 characters'],
      maxlength: [5000, 'Description cannot exceed 5000 characters']
    },
    responsibilities: {
      type: [String],
      default: [],
      validate: {
        validator: function(arr) {
          return arr.every(item => item.length <= 500);
        },
        message: 'Each responsibility must be less than 500 characters'
      }
    },
    requirements: {
      type: [String],
      default: [],
      validate: {
        validator: function(arr) {
          return arr.every(item => item.length <= 500);
        },
        message: 'Each requirement must be less than 500 characters'
      }
    },
    contactEmail: {
      type: String,
      required: [true, 'Contact email is required'],
      trim: true,
      lowercase: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address'
      ]
    },
    postedDate: {
      type: Date,
      default: Date.now,
      immutable: true
    },
    expiryDate: {
      type: Date,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'expired'],
      default: 'active',
      index: true
    },
    views: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for efficient querying
jobSchema.index({ language: 1, status: 1 });
jobSchema.index({ jobType: 1, status: 1 });
jobSchema.index({ status: 1, postedDate: -1 });
jobSchema.index({ expiryDate: 1 });

// Compound text index for search functionality
jobSchema.index({
  title: 'text',
  description: 'text',
  companyName: 'text',
  language: 'text'
});

// Virtual field: days remaining until expiry
jobSchema.virtual('daysRemaining').get(function() {
  const now = new Date();
  const diff = this.expiryDate - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Virtual field: is expired
jobSchema.virtual('isExpired').get(function() {
  return new Date() > this.expiryDate;
});

// Pre-save middleware: Set expiry date to 7 days from posting
jobSchema.pre('save', function(next) {
  if (this.isNew && !this.expiryDate) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);
    this.expiryDate = expiryDate;
  }
  next();
});

// Pre-save middleware: Auto-update status based on expiry
jobSchema.pre('save', function(next) {
  if (this.isExpired && this.status === 'active') {
    this.status = 'expired';
  }
  next();
});

// Static method: Get active jobs with filters
jobSchema.statics.getActiveJobs = function(filters = {}) {
  const query = { status: 'active', expiryDate: { $gt: new Date() } };

  if (filters.language) {
    query.language = new RegExp(filters.language, 'i');
  }

  if (filters.jobType) {
    query.jobType = filters.jobType;
  }

  if (filters.isRemote !== undefined) {
    query.isRemote = filters.isRemote;
  }

  if (filters.search) {
    query.$text = { $search: filters.search };
  }

  return this.find(query).sort({ postedDate: -1 });
};

// Static method: Mark expired jobs
jobSchema.statics.markExpiredJobs = async function() {
  const result = await this.updateMany(
    {
      expiryDate: { $lt: new Date() },
      status: 'active'
    },
    {
      $set: { status: 'expired' }
    }
  );
  return result;
};

// Static method: Get job stats
jobSchema.statics.getJobStats = async function() {
  const now = new Date();
  
  const [stats] = await this.aggregate([
    {
      $facet: {
        totalJobs: [{ $count: 'count' }],
        activeJobs: [
          { $match: { status: 'active', expiryDate: { $gt: now } } },
          { $count: 'count' }
        ],
        uniqueLanguages: [
          { $match: { status: 'active', expiryDate: { $gt: now } } },
          { $group: { _id: '$language' } },
          { $count: 'count' }
        ],
        uniqueCompanies: [
          { $match: { status: 'active', expiryDate: { $gt: now } } },
          { $group: { _id: '$companyName' } },
          { $count: 'count' }
        ]
      }
    }
  ]);

  return {
    totalJobs: stats.totalJobs[0]?.count || 0,
    activeJobs: stats.activeJobs[0]?.count || 0,
    languages: stats.uniqueLanguages[0]?.count || 0,
    companies: stats.uniqueCompanies[0]?.count || 0
  };
};

// Instance method: Increment views
jobSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Instance method: Check if job is about to expire (less than 2 days)
jobSchema.methods.isExpiringsoon = function() {
  return this.daysRemaining <= 2 && this.daysRemaining > 0;
};

const Job = mongoose.model('Job', jobSchema);

module.exports = Job;