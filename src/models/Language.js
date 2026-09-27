// models/Language.js
import mongoose from "mongoose";

const resourceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    url: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      required: true,
      enum: [
        "youtube",
        "website",
        "article",
        "book",
        "podcast",
        "app",
        "dictionary",
        "grammar",
        "practice"
      ]
    },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced", "all"],
      default: "all"
    },
    isFree: {
      type: Boolean,
      default: true
    },
    source: {
      type: String,
      trim: true
    },
    featured: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

const languageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    nativeName: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    script: {
      type: [String],
      default: []
    },
    regions: {
      type: [String],
      default: []
    },
    speakerBase: {
      // Free text, e.g. "80 million+" — kept approximate on purpose
      type: String,
      trim: true
    },
    prerequisites: {
      type: String,
      trim: true
    },
    roadmap: {
      // "Start Learning" step list, in order
      type: [String],
      default: []
    },
    resources: {
      type: [resourceSchema],
      default: []
    },
    paidContent: {
      enabled: { type: Boolean, default: true },
      url: { type: String, default: "https://learn.vartalang.in" }
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

/* Indexes */
languageSchema.index({ status: 1, name: 1 });

/* Statics */
languageSchema.statics.getPublished = function () {
  return this.find({ status: "published" }).sort({ name: 1 });
};

languageSchema.statics.getBySlug = function (slug) {
  return this.findOne({ slug: slug.toLowerCase(), status: "published" });
};

const Language = mongoose.model("Language", languageSchema);

export default Language;