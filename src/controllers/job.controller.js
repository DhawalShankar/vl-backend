import Job from "../models/Job.js";

/* -------------------- CONSTANTS -------------------- */

const DISPOSABLE_DOMAINS = [
  "tempmail.com",
  "guerrillamail.com",
  "mailinator.com",
  "10minutemail.com",
  "throwaway.email",
  "temp-mail.org",
  "fakeinbox.com"
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
  "business analyst"
];

/* -------------------- HELPERS -------------------- */

const isDisposableEmail = (email) => {
  const domain = email.split("@")[1]?.toLowerCase();
  return DISPOSABLE_DOMAINS.includes(domain);
};

const isLanguageRelatedJob = (title, description) => {
  const text = `${title} ${description}`.toLowerCase();
  return !NON_LANGUAGE_KEYWORDS.some(k => text.includes(k));
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

    if (!title || !language || !companyName || !description || !contactEmail) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    if (isDisposableEmail(contactEmail)) {
      return res.status(400).json({
        success: false,
        message: "Disposable email not allowed"
      });
    }

    if (!isLanguageRelatedJob(title, description)) {
      return res.status(400).json({
        success: false,
        message: "Only language-related jobs allowed"
      });
    }

    const job = await Job.create({
      title: title.trim(),
      language: language.trim(),
      proficiencyLevel,
      jobType,
      companyName: companyName.trim(),
      location: location.trim(),
      isRemote: isRemote === true || isRemote === "true",
      description: description.trim(),
      responsibilities,
      requirements,
      contactEmail: contactEmail.toLowerCase()
    });

    res.status(201).json({
      success: true,
      message: "Job listed successfully",
      jobId: job._id,
      expiryDate: job.expiryDate
    });
  } catch (err) {
    console.error("Create job error:", err);
    res.status(500).json({ success: false, message: "Failed to create job" });
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
