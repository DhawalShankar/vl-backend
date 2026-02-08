// job.controller.js
import Job from "../models/Job.js";

/* -------------------- CONSTANTS -------------------- */

const DISPOSABLE_DOMAINS = [
  "tempmail.com",
  "guerrillamail.com",
  "mailinator.com",
  "10minutemail.com",
  "throwaway.email",
  "temp-mail.org",
  "fakeinbox.com",
  "yopmail.com",
  "maildrop.cc"
];

const LANGUAGE_KEYWORDS = [
  "translat",
  "interpret",
  "language",
  "bilingual",
  "multilingual",
  "native speaker",
  "fluent",
  "proficiency",
  "linguistic",
  "localization",
  "l10n",
  "teach",
  "tutor",
  "instructor"
];

const NON_LANGUAGE_KEYWORDS = [
  "software engineer",
  "web developer",
  "data scientist",
  "accountant",
  "sales manager",
  "marketing manager",
  "graphic designer",
  "project manager",
  "business analyst",
  "full stack",
  "backend developer",
  "frontend developer"
];

/* -------------------- HELPERS -------------------- */

const isDisposableEmail = (email) => {
  if (!email) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  return !domain || DISPOSABLE_DOMAINS.includes(domain);
};

const isLanguageRelatedJob = (title, description) => {
  const text = `${title} ${description}`.toLowerCase();
  
  // First check: Must NOT contain non-language keywords
  const hasNonLanguageKeywords = NON_LANGUAGE_KEYWORDS.some(k => text.includes(k));
  if (hasNonLanguageKeywords) return false;
  
  // Second check: MUST contain at least one language-related keyword
  const hasLanguageKeywords = LANGUAGE_KEYWORDS.some(k => text.includes(k));
  return hasLanguageKeywords;
};

const validateEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

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
    const job = await Job.findById(req.params.id).select("-__v");

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

    // Validation: Required fields
    if (!title || !language || !companyName || !description || !contactEmail) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields. Please fill in all required fields." 
      });
    }

    // Validation: Email format
    if (!validateEmail(contactEmail)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email format. Please use a valid email address."
      });
    }

    // Validation: Disposable email
    if (isDisposableEmail(contactEmail)) {
      return res.status(400).json({
        success: false,
        error: "Disposable email addresses are not allowed. Please use an official company email."
      });
    }

    // Validation: Language-related job
    if (!isLanguageRelatedJob(title, description)) {
      return res.status(400).json({
        success: false,
        error: "This job doesn't appear to be language-focused. Language skill must be the PRIMARY requirement. Include keywords like 'translation', 'interpreter', 'language', 'bilingual', etc."
      });
    }

    // Validation: Description length
    if (description.trim().length < 50) {
      return res.status(400).json({
        success: false,
        error: "Job description must be at least 50 characters long."
      });
    }

    if (description.trim().length > 5000) {
      return res.status(400).json({
        success: false,
        error: "Job description must be less than 5000 characters."
      });
    }

    // Process responsibilities and requirements
    const processedResponsibilities = Array.isArray(responsibilities)
      ? responsibilities
      : responsibilities?.split('\n').filter(r => r.trim()).map(r => r.trim()) || [];

    const processedRequirements = Array.isArray(requirements)
      ? requirements
      : requirements?.split('\n').filter(r => r.trim()).map(r => r.trim()) || [];

    // Create job
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
      contactEmail: contactEmail.toLowerCase().trim()
    });

    res.status(201).json({
      success: true,
      message: "Job posted successfully! It will be live for 7 days.",
      jobId: job._id,
      expiryDate: job.expiryDate
    });
  } catch (err) {
    console.error("Create job error:", err);
    
    // Handle Mongoose validation errors
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ 
        success: false, 
        error: errors.join(', ') 
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
    if (!job) return res.status(404).json({ success: false });

    await job.deleteOne();
    res.json({ success: true, message: "Job deleted" });
  } catch (err) {
    console.error("Delete job error:", err);
    res.status(500).json({ success: false });
  }
};