// models/Job.js
import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
      maxlength: [200, 'Job title cannot exceed 200 characters']
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
        values: ["Basic", "Intermediate", "Advanced", "Native"],
        message: '{VALUE} is not a valid proficiency level'
      }
    },
    jobType: {
      type: String,
      required: [true, 'Job type is required'],
      enum: {
        values: [
          "translation",
          "teaching",
          "interpretation",
          "content",
          "assistance",
          "research",
          "other"
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
        validator: function(v) {
          return v.every(item => item.trim().length > 0);
        },
        message: 'All responsibilities must be non-empty'
      }
    },
    requirements: {
      type: [String],
      default: [],
      validate: {
        validator: function(v) {
          return v.every(item => item.trim().length > 0);
        },
        message: 'All requirements must be non-empty'
      }
    },
    contactEmail: {
      type: String,
      required: [true, 'Contact email is required'],
      lowercase: true,
      trim: true,
      validate: {
        validator: function(v) {
          return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v);
        },
        message: 'Please provide a valid email address'
      }
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
jobSchema.index({
  title: "text",
  description: "text",
  companyName: "text",
  language: "text"
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
jobSchema.pre("save", function (next) {
  if (this.isNew && !this.expiryDate) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    this.expiryDate = d;
  }
  if (this.isExpired) {
    this.status = "expired";
  }
  next();
});

/* Statics */
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

/* Methods */
jobSchema.methods.incrementViews = function () {
  this.views += 1;
  return this.save();
};

const Job = mongoose.model("Job", jobSchema);
export default Job;