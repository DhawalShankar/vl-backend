const Job = require('../models/Job');

// List of disposable email domains to block
const DISPOSABLE_DOMAINS = [
  'tempmail.com',
  'guerrillamail.com',
  'mailinator.com',
  '10minutemail.com',
  'throwaway.email',
  'temp-mail.org',
  'fakeinbox.com'
];

// Keywords that suggest non-language jobs (optional validation)
const NON_LANGUAGE_KEYWORDS = [
  'software engineer',
  'web developer',
  'data scientist',
  'accountant',
  'sales manager',
  'marketing manager',
  'graphic designer',
  'project manager',
  'business analyst'
];

/**
 * Validate if email is from a disposable domain
 */
const isDisposableEmail = (email) => {
  const domain = email.split('@')[1]?.toLowerCase();
  return DISPOSABLE_DOMAINS.includes(domain);
};

/**
 * Validate if job appears to be language-related
 */
const isLanguageRelatedJob = (title, description) => {
  const combinedText = `${title} ${description}`.toLowerCase();
  
  // Check for non-language keywords
  const hasNonLanguageKeyword = NON_LANGUAGE_KEYWORDS.some(keyword =>
    combinedText.includes(keyword.toLowerCase())
  );
  
  return !hasNonLanguageKeyword;
};

/**
 * @desc    Get job statistics
 * @route   GET /api/jobs/stats
 * @access  Public
 */
exports.getJobStats = async (req, res) => {
  try {
    const stats = await Job.getJobStats();

    res.status(200).json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting job stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching job statistics',
      error: error.message
    });
  }
};

/**
 * @desc    Get all active job listings with filters
 * @route   GET /api/jobs/listings
 * @access  Public
 */
exports.getJobListings = async (req, res) => {
  try {
    const {
      language,
      jobType,
      isRemote,
      search,
      page = 1,
      limit = 50
    } = req.query;

    // Build filters
    const filters = {};
    if (language) filters.language = language;
    if (jobType) filters.jobType = jobType;
    if (isRemote !== undefined) filters.isRemote = isRemote === 'true';
    if (search) filters.search = search;

    // Get jobs with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const jobs = await Job.getActiveJobs(filters)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v');

    // Get total count for pagination
    const query = { status: 'active', expiryDate: { $gt: new Date() } };
    if (filters.language) query.language = new RegExp(filters.language, 'i');
    if (filters.jobType) query.jobType = filters.jobType;
    if (filters.isRemote !== undefined) query.isRemote = filters.isRemote;
    if (filters.search) query.$text = { $search: filters.search };

    const totalJobs = await Job.countDocuments(query);

    res.status(200).json({
      success: true,
      count: jobs.length,
      totalJobs,
      totalPages: Math.ceil(totalJobs / parseInt(limit)),
      currentPage: parseInt(page),
      jobs
    });
  } catch (error) {
    console.error('Error getting job listings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching job listings',
      error: error.message
    });
  }
};

/**
 * @desc    Get single job by ID
 * @route   GET /api/jobs/listings/:id
 * @access  Public
 */
exports.getJobById = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).select('-__v');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if job is expired
    if (job.status === 'expired' || job.isExpired) {
      return res.status(410).json({
        success: false,
        message: 'This job listing has expired'
      });
    }

    res.status(200).json({
      success: true,
      job
    });
  } catch (error) {
    console.error('Error getting job:', error);
    
    // Handle invalid MongoDB ID
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid job ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error fetching job details',
      error: error.message
    });
  }
};

/**
 * @desc    Create new job listing
 * @route   POST /api/jobs/listings
 * @access  Public
 */
exports.createJob = async (req, res) => {
  try {
    const {
      title,
      language,
      proficiencyLevel,
      jobType,
      companyName,
      location,
      isRemote,
      description,
      responsibilities,
      requirements,
      contactEmail
    } = req.body;

    // Validate required fields
    if (!title || !language || !proficiencyLevel || !jobType || 
        !companyName || !location || !description || !contactEmail) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided',
        requiredFields: [
          'title', 'language', 'proficiencyLevel', 'jobType',
          'companyName', 'location', 'description', 'contactEmail'
        ]
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Check for disposable email
    if (isDisposableEmail(contactEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please use an official company email address. Temporary email services are not allowed.'
      });
    }

    // Optional: Validate language-related job
    if (!isLanguageRelatedJob(title, description)) {
      return res.status(400).json({
        success: false,
        message: 'This appears to be a non-language job. VartaLang Jobs is exclusively for language-related positions.',
        hint: 'Jobs should involve translation, teaching, interpretation, content writing, or other language work.'
      });
    }

    // Create job object
    const jobData = {
      title: title.trim(),
      language: language.trim(),
      proficiencyLevel,
      jobType,
      companyName: companyName.trim(),
      location: location.trim(),
      isRemote: isRemote === true || isRemote === 'true',
      description: description.trim(),
      responsibilities: responsibilities || [],
      requirements: requirements || [],
      contactEmail: contactEmail.trim().toLowerCase()
    };

    // Create job in database
    const job = await Job.create(jobData);

    res.status(201).json({
      success: true,
      message: 'Job posted successfully! Your listing will be active for 7 days.',
      job: {
        _id: job._id,
        title: job.title,
        language: job.language,
        companyName: job.companyName,
        expiryDate: job.expiryDate,
        daysRemaining: job.daysRemaining
      }
    });
  } catch (error) {
    console.error('Error creating job:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating job listing',
      error: error.message
    });
  }
};

/**
 * @desc    Increment job view count
 * @route   POST /api/jobs/listings/:id/view
 * @access  Public
 */
exports.incrementJobViews = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Don't increment views for expired jobs
    if (job.status === 'expired' || job.isExpired) {
      return res.status(200).json({
        success: true,
        message: 'Job is expired'
      });
    }

    await job.incrementViews();

    res.status(200).json({
      success: true,
      views: job.views
    });
  } catch (error) {
    console.error('Error incrementing views:', error);
    
    // Handle invalid MongoDB ID
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid job ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating view count',
      error: error.message
    });
  }
};

/**
 * @desc    Mark expired jobs (to be called by cron job)
 * @route   POST /api/jobs/mark-expired
 * @access  Private/Admin (add auth middleware)
 */
exports.markExpiredJobs = async (req, res) => {
  try {
    const result = await Job.markExpiredJobs();

    res.status(200).json({
      success: true,
      message: `Marked ${result.modifiedCount} jobs as expired`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking expired jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking expired jobs',
      error: error.message
    });
  }
};

/**
 * @desc    Get unique languages from active jobs
 * @route   GET /api/jobs/languages
 * @access  Public
 */
exports.getAvailableLanguages = async (req, res) => {
  try {
    const languages = await Job.distinct('language', {
      status: 'active',
      expiryDate: { $gt: new Date() }
    });

    res.status(200).json({
      success: true,
      count: languages.length,
      languages: languages.sort()
    });
  } catch (error) {
    console.error('Error getting languages:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available languages',
      error: error.message
    });
  }
};

/**
 * @desc    Delete job (for admin use or job owner - requires auth)
 * @route   DELETE /api/jobs/listings/:id
 * @access  Private (add auth middleware)
 */
exports.deleteJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    await job.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Job deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting job:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid job ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error deleting job',
      error: error.message
    });
  }
};