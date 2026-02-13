// job.controller.js - COMPLETE FIXED VERSION WITH ONE JOB PER USER LIMIT
import Job from "../models/Job.js";
import User from "../models/User.js";

/* -------------------- CONTROLLERS -------------------- */

export const getJobStats = async (req, res) => {
  try {
    const stats = await Job.getJobStats();
    res.status(200).json({ success: true, stats });
  } catch (err) {
    console.error("Job stats error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch stats" });
  }
};

export const getJobListings = async (req, res) => {
  try {
    const { language, jobType, isRemote, search, page = 1, limit = 50 } = req.query;

    const filters = {};
    if (language) filters.language = language;
    if (jobType) filters.jobType = jobType;
    if (isRemote !== undefined) filters.isRemote = isRemote === "true";
    if (search) filters.search = search;

    const skip = (page - 1) * limit;

    const jobs = await Job.getActiveJobs(filters)
      .skip(skip)
      .limit(Number(limit))
      .populate('postedBy', 'name email')
      .select("-__v");

    const totalJobs = await Job.countDocuments({
      status: "active",
      expiryDate: { $gt: new Date() }
    });

    res.json({
      success: true,
      jobs,
      totalJobs,
      currentPage: Number(page),
      totalPages: Math.ceil(totalJobs / limit)
    });
  } catch (err) {
    console.error("Get jobs error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch jobs" });
  }
};

export const getJobById = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('postedBy', 'name email')
      .select("-__v");

    if (!job)
      return res.status(404).json({ success: false, message: "Job not found" });

    if (job.status === "expired" || job.isExpired)
      return res.status(410).json({ success: false, message: "Job expired" });

    res.json({ success: true, job });
  } catch (err) {
    console.error("Get job error:", err);
    res.status(500).json({ success: false, message: "Invalid job ID" });
  }
};

export const createJob = async (req, res) => {
  try {
    // ✅ CHECK AUTHENTICATION
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ 
        success: false, 
        error: "Authentication required to post a job" 
      });
    }

    // ✅ CHECK IF USER ALREADY HAS A JOB POSTED
    const existingJob = await Job.findOne({ 
      postedBy: req.user.userId,
      status: "active",
      expiryDate: { $gt: new Date() }
    });

    if (existingJob) {
      return res.status(403).json({ 
        success: false, 
        error: "You already have an active job posting. Each user can only post one job at a time. For extensions or additional postings, please contact vartalang@gmail.com" 
      });
    }

    // ✅ FETCH USER DETAILS
    const user = await User.findById(req.user.userId).select('name email');
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: "User not found" 
      });
    }

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

    // REQUIRED FIELDS CHECK
    if (!title || !language || !companyName || !description || !contactEmail) {
      return res.status(400).json({ 
        success: false, 
        error: "Please fill all required fields" 
      });
    }

    // Process responsibilities and requirements
    const processedResponsibilities = Array.isArray(responsibilities)
      ? responsibilities
      : responsibilities?.split('\n').filter(r => r.trim()).map(r => r.trim()) || [];

    const processedRequirements = Array.isArray(requirements)
      ? requirements
      : requirements?.split('\n').filter(r => r.trim()).map(r => r.trim()) || [];

    // ✅ CREATE JOB WITH CORRECT USER ID
    const job = await Job.create({
      title: title.trim(),
      language: language.trim(),
      proficiencyLevel: proficiencyLevel || 'Intermediate',
      jobType: jobType || 'other',
      companyName: companyName.trim(),
      location: location?.trim() || 'Remote',
      isRemote: isRemote === true || isRemote === "true",
      description: description.trim(),
      responsibilities: processedResponsibilities,
      requirements: processedRequirements,
      contactEmail: contactEmail.trim().toLowerCase(),
      postedBy: req.user.userId,        // ✅ FIX
      postedByName: user.name            // ✅ FIX
    });

    // Populate before sending response
    await job.populate('postedBy', 'name email');

    res.status(201).json({
      success: true,
      message: "Job posted successfully! It will be live for 7 days. Note: Each user can only have one active job posting at a time. For extensions, contact vartalang@gmail.com",
      jobId: job._id,
      expiryDate: job.expiryDate,
      job
    });
  } catch (err) {
    console.error("Create job error:", err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false, 
        error: "Please check your input and try again" 
      });
    }

    res.status(500).json({ 
      success: false, 
      error: "Failed to create job. Please try again." 
    });
  }
};

export const incrementJobViews = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false });

    if (!job.isExpired) await job.incrementViews();

    res.json({ success: true, views: job.views });
  } catch (err) {
    console.error("View increment error:", err);
    res.status(500).json({ success: false });
  }
};

export const markExpiredJobs = async (req, res) => {
  try {
    const result = await Job.markExpiredJobs();
    res.json({ success: true, modified: result.modifiedCount });
  } catch (err) {
    console.error("Expire jobs error:", err);
    res.status(500).json({ success: false });
  }
};

export const getAvailableLanguages = async (req, res) => {
  try {
    const languages = await Job.distinct("language", {
      status: "active",
      expiryDate: { $gt: new Date() }
    });

    res.json({ success: true, languages: languages.sort() });
  } catch (err) {
    console.error("Languages error:", err);
    res.status(500).json({ success: false });
  }
};

export const deleteJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ 
        success: false, 
        message: "Job not found" 
      });
    }

    // ✅ CHECK OWNERSHIP - FIX
    if (job.postedBy.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: "You can only delete your own jobs" 
      });
    }

    await job.deleteOne();
    res.json({ 
      success: true, 
      message: "Job deleted successfully. You can now post a new job if needed." 
    });
  } catch (err) {
    console.error("Delete job error:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to delete job" 
    });
  }
};

export const getMyJobs = async (req, res) => {
  try {
    // ✅ CHECK AUTHENTICATION
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ 
        success: false, 
        message: "Authentication required" 
      });
    }

    // ✅ FIX: Use req.user.userId
    const jobs = await Job.find({ postedBy: req.user.userId })
      .sort({ postedDate: -1 })
      .select("-__v");

    res.json({ 
      success: true, 
      jobs,
      count: jobs.length,
      message: jobs.length === 0 
        ? "You haven't posted any jobs yet. You can post one job for free (7 days)." 
        : jobs.length === 1 && jobs[0].status === "active" 
          ? "You have reached your limit of 1 active job. For extensions or additional postings, contact vartalang@gmail.com"
          : "For job extensions or additional postings, contact vartalang@gmail.com"
    });
  } catch (err) {
    console.error("Get my jobs error:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch your jobs" 
    });
  }
};