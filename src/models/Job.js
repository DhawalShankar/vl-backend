// models/Job.js - FIXED VERSION
import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    language: {
      type: String,
      required: true,
      trim: true
    },
    proficiencyLevel: {
      type: String,
      required: true,
      enum: ["Basic", "Intermediate", "Advanced", "Native"],
      default: "Intermediate"
    },
    jobType: {
      type: String,
      required: true,
      enum: ["translation", "teaching", "interpretation", "content", "assistance", "research", "other"],
      default: "other"
    },
    companyName: {
      type: String,
      required: true,
      trim: true
    },
    location: {
      type: String,
      required: true,
      trim: true,
      default: "Remote"
    },
    isRemote: {
      type: Boolean,
      default: false
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    responsibilities: {
      type: [String],
      default: []
    },
    requirements: {
      type: [String],
      default: []
    },
    contactEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    postedDate: {
      type: Date,
      default: Date.now,
      immutable: true
    },
    expiryDate: {
      type: Date,
      index: true
    },
    status: {
      type: String,
      enum: ["active", "expired"],
      default: "active",
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

/* Indexes */
jobSchema.index({ language: 1, status: 1 });
jobSchema.index({ jobType: 1, status: 1 });
jobSchema.index({ status: 1, postedDate: -1 });

// ✅ FIXED: Text index with language override prevention
jobSchema.index({
  title: "text",
  description: "text",
  companyName: "text"
}, {
  default_language: "none",  // Don't use language-specific stemming
  language_override: "searchLanguage"  // Prevents MongoDB from using 'language' field for text search
});

/* Virtuals */
jobSchema.virtual("daysRemaining").get(function () {
  const days = Math.ceil((this.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
});

jobSchema.virtual("isExpired").get(function () {
  return new Date() > this.expiryDate;
});

/* Middleware */
jobSchema.pre("save", async function () {
  if (this.isNew && !this.expiryDate) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    this.expiryDate = d;
  }
  if (this.isExpired) {
    this.status = "expired";
  }
});

/* Static Methods */
jobSchema.statics.getActiveJobs = function (filters = {}) {
  const query = { status: "active", expiryDate: { $gt: new Date() } };
  if (filters.language) query.language = new RegExp(filters.language, "i");
  if (filters.jobType) query.jobType = filters.jobType;
  if (filters.isRemote !== undefined) query.isRemote = filters.isRemote;
  if (filters.search) query.$text = { $search: filters.search };
  return this.find(query).sort({ postedDate: -1 });
};

jobSchema.statics.markExpiredJobs = function () {
  return this.updateMany(
    { expiryDate: { $lt: new Date() }, status: "active" },
    { $set: { status: "expired" } }
  );
};

jobSchema.statics.getJobStats = async function () {
  const now = new Date();
  const [stats] = await this.aggregate([
    {
      $facet: {
        totalJobs: [{ $count: "count" }],
        activeJobs: [
          { $match: { status: "active", expiryDate: { $gt: now } } },
          { $count: "count" }
        ]
      }
    }
  ]);
  return {
    totalJobs: stats.totalJobs[0]?.count || 0,
    activeJobs: stats.activeJobs[0]?.count || 0
  };
};

/* Instance Methods */
jobSchema.methods.incrementViews = function () {
  this.views += 1;
  return this.save();
};

const Job = mongoose.model("Job", jobSchema);

export default Job;