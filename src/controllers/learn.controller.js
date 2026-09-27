// controllers/learn.controller.js
import Language from "../models/Language.js";

/* ---------------- Public ---------------- */

// GET /learn — list published languages (light fields for the guide grid)
export const getLanguages = async (req, res) => {
  try {
    const languages = await Language.find({ status: "published" })
      .select("name slug nativeName description script regions")
      .sort({ name: 1 });

    res.json({ success: true, languages });
  } catch (error) {
    console.error("getLanguages error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// GET /learn/:slug — full guide for one language
export const getLanguageBySlug = async (req, res) => {
  try {
    const language = await Language.findOne({
      slug: req.params.slug.toLowerCase(),
      status: "published"
    });

    if (!language) {
      return res
        .status(404)
        .json({ success: false, error: "Language guide not found" });
    }

    res.json({ success: true, language });
  } catch (error) {
    console.error("getLanguageBySlug error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/* ---------------- Admin ---------------- */

// GET /learn/admin/all — list everything, drafts included
export const getAllLanguagesAdmin = async (req, res) => {
  try {
    const languages = await Language.find().sort({ name: 1 });
    res.json({ success: true, languages });
  } catch (error) {
    console.error("getAllLanguagesAdmin error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// POST /learn — create a language guide
export const createLanguage = async (req, res) => {
  try {
    const language = await Language.create(req.body);
    res.status(201).json({ success: true, language });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ success: false, error: "A language with this slug already exists" });
    }
    console.error("createLanguage error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// PUT /learn/:id — update a language guide's top-level fields
export const updateLanguage = async (req, res) => {
  try {
    const language = await Language.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!language) {
      return res.status(404).json({ success: false, error: "Language not found" });
    }

    res.json({ success: true, language });
  } catch (error) {
    console.error("updateLanguage error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// DELETE /learn/:id
export const deleteLanguage = async (req, res) => {
  try {
    const language = await Language.findByIdAndDelete(req.params.id);

    if (!language) {
      return res.status(404).json({ success: false, error: "Language not found" });
    }

    res.json({ success: true, message: "Language deleted" });
  } catch (error) {
    console.error("deleteLanguage error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// POST /learn/:id/resources — add one resource
export const addResource = async (req, res) => {
  try {
    const language = await Language.findById(req.params.id);

    if (!language) {
      return res.status(404).json({ success: false, error: "Language not found" });
    }

    language.resources.push(req.body);
    await language.save();

    res.status(201).json({ success: true, language });
  } catch (error) {
    console.error("addResource error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// PUT /learn/:id/resources/:resourceId — edit one resource (category, level, featured, etc.)
export const updateResource = async (req, res) => {
  try {
    const language = await Language.findById(req.params.id);

    if (!language) {
      return res.status(404).json({ success: false, error: "Language not found" });
    }

    const resource = language.resources.id(req.params.resourceId);
    if (!resource) {
      return res.status(404).json({ success: false, error: "Resource not found" });
    }

    Object.assign(resource, req.body);
    await language.save();

    res.json({ success: true, language });
  } catch (error) {
    console.error("updateResource error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// DELETE /learn/:id/resources/:resourceId
export const deleteResource = async (req, res) => {
  try {
    const language = await Language.findById(req.params.id);

    if (!language) {
      return res.status(404).json({ success: false, error: "Language not found" });
    }

    const resource = language.resources.id(req.params.resourceId);
    if (!resource) {
      return res.status(404).json({ success: false, error: "Resource not found" });
    }

    resource.deleteOne();
    await language.save();

    res.json({ success: true, language });
  } catch (error) {
    console.error("deleteResource error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};