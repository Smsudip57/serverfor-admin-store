const mongoose = require("mongoose");

const featuresSchema = mongoose.Schema({
  featureCategory: {
    type: String,
    required: true,
  },
  featuresList: [
    {
      featuresName: {
        type: String,
        required: true,
      },
      value: {
        type: Boolean,
        required: true,
        default: false,
      },
    },
  ],
});

const faqSchema = mongoose.Schema({
  question: {
    type: String,
    required: true,
  },
  answer: {
    type: String,
    required: true,
  },
});

const specificationSchema = mongoose.Schema({
  key: {
    type: String,
    required: true,
  },
  value: {
    type: String,
    required: true,
  },
});

const productSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  images: [
    {
      type: String,
      required: true,
    },
  ],
  videos: [
    {
      type: String,
      default: null,
    },
  ],
  thumbnail: {
    type: String,
    default: null,
  },
  webmetag: {
    type: String,
    default: "",
  },
  brand: {
    type: String,
    default: "",
  },
  price: {
    type: Number,
    default: 0,
  },
  oldPrice: {
    type: Number,
    default: 0,
  },
  catName: {
    type: String,
    default: "",
  },
  catId: {
    type: String,
    default: "",
  },
  subCatId: {
    type: String,
    default: "",
  },
  subCat: {
    type: String,
    default: "",
  },
  subCatName: {
    type: String,
    default: "",
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true,
  },
  countInStock: {
    type: Number,
    required: true,
  },
  rating: {
    type: Number,
    default: 0,
  },
  isFeatured: {
    type: Boolean,
    default: false,
  },
  discount: {
    type: Number,
    required: true,
  },
  productRam: [
    {
      type: String,
      default: null,
    },
  ],
  size: [
    {
      type: String,
      default: null,
    },
  ],
  productWeight: [
    {
      type: String,
      default: null,
    },
  ],
  location: {
    type: String,
    default: "All",
  },
  dateCreated: {
    type: Date,
    default: Date.now,
  },
  features: [featuresSchema],
  faq: [faqSchema],
  specifications: [specificationSchema],
});

productSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

productSchema.set("toJSON", {
  virtuals: true,
});

exports.Product = mongoose.model("Product", productSchema);
