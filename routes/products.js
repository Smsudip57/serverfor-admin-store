const { Category } = require("../models/category.js");
const { Product } = require("../models/products.js");
const { MyList } = require("../models/myList");
const { Cart } = require("../models/cart");
const { RecentlyViewd } = require("../models/recentlyViewd.js");
const { ImageUpload } = require("../models/imageUpload.js");
const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const mongoose = require("mongoose");

const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.cloudinary_Config_Cloud_Name,
  api_key: process.env.cloudinary_Config_api_key,
  api_secret: process.env.cloudinary_Config_api_secret,
  secure: true,
});

var imagesArr = [];

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads");
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}_${file.originalname}`);
    //imagesArr.push(`${Date.now()}_${file.originalname}`)
    //console.log(file.originalname)
  },
});

const upload = multer({ storage: storage });

router.post(`/upload`, upload.array("images"), async (req, res) => {
  imagesArr = [];

  try {
    for (let i = 0; i < req.files?.length; i++) {
      const options = {
        use_filename: true,
        unique_filename: false,
        overwrite: false,
      };

      imagesArr.push("https://server.webmedigital.com/" + req.files[i].path);
      // const img = await cloudinary.uploader.upload(
      //   req.files[i].path,
      //   options,
      //   function (error, result) {
      //     imagesArr.push(result.secure_url);
      //   }
      // );
      // fs.unlinkSync(`uploads/${req.files[i].filename}`);
    }

    let imagesUploaded = new ImageUpload({
      images: imagesArr,
    });

    imagesUploaded = await imagesUploaded.save();

    return res.status(200).json(imagesArr);
  } catch (error) {
    console.log(error);
  }
});

router.get("/getbytag", async (req, res) => {
  const { tag } = req.query;

  if (!tag) {
    return res.status(400).json({ message: "Tag is required" });
  }

  try {
    const products = await Product.find({ webmetag: tag });
    return res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products by tag:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get(`/`, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10; // Add default value

    // Validate perPage to prevent division by zero
    if (perPage <= 0) {
      return res.status(400).json({
        message: "perPage must be a positive number",
        success: false,
      });
    }

    const totalPosts = await Product.countDocuments();
    const totalPages = Math.ceil(totalPosts / perPage);

    // Handle case where page exceeds total pages
    if (page > totalPages && totalPages > 0) {
      return res.status(404).json({
        message: "Page not found",
        success: false,
      });
    }

    let productList = [];
    let query = {};

    // Build query object properly
    if (
      req.query.location &&
      req.query.location !== null &&
      req.query.location !== undefined &&
      req.query.location !== "" &&
      req.query.location !== "All"
    ) {
      query.location = req.query.location;
    }

    // Add other query parameters if needed
    if (req.query.catId && req.query.catId !== "") {
      query.catId = req.query.catId;
    }

    if (req.query.catName && req.query.catName !== "") {
      query.catName = req.query.catName;
    }

    if (req.query.subCatId && req.query.subCatId !== "") {
      query.subCatId = req.query.subCatId;
    }

    if (req.query.isFeatured !== undefined) {
      query.isFeatured = req.query.isFeatured === "true";
    }

    // Execute query
    productList = await Product.find(query)
      .populate("category")
      .skip((page - 1) * perPage)
      .limit(perPage)
      .exec();

    return res.status(200).json({
      success: true,
      products: productList,
      totalPages: totalPages,
      currentPage: page,
      totalProducts: totalPosts,
      productsPerPage: perPage,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

router.get(`/catName`, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(req.query.perPage);
  const totalPosts = await Product.countDocuments();
  const totalPages = Math.ceil(totalPosts / perPage);

  if (page > totalPages) {
    return res.status(404).json({ message: "Page not found" });
  }

  let productList = [];

  const queryparams = {};

  if (req.query.catName !== "" && req.query.catName !== undefined) {
    queryparams.catName = req.query.catName;
  }
  if (req.query.location !== "" && req.query.location !== undefined) {
    queryparams.location = req.query.location;
  }

  if (req.query.page !== "" && req.query.perPage !== "") {
    productList = await Product.find(queryparams)
      .populate("category")
      .skip((page - 1) * perPage)
      .limit(perPage)
      .exec();
    return res.status(200).json({
      products: productList,
      totalPages: totalPages,
      page: page,
    });
  } else {
    productList = await Product.find({
      location: req.query.location,
      catName: req.query.catName,
    });
    return res.status(200).json({
      products: productList,
    });
  }
});

router.get(`/catId`, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(req.query.perPage);
  const totalPosts = await Product.countDocuments();
  const totalPages = Math.ceil(totalPosts / perPage);

  if (page > totalPages) {
    return res.status(404).json({ message: "Page not found" });
  }

  let productList = [];

  if (req.query.page !== "" && req.query.perPage !== "") {
    productList = await Product.find({
      location: req.query.location,
      catId: req.query.catId,
    })
      .populate("category")
      .skip((page - 1) * perPage)
      .limit(perPage)
      .exec();

    return res.status(200).json({
      products: productList,
      totalPages: totalPages,
      page: page,
    });
  } else {
    productList = await Product.find({
      location: req.query.location,
      catId: req.query.catId,
    });

    return res.status(200).json({
      products: productList,
    });
  }
});

router.get(`/subCatId`, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(req.query.perPage);
  const totalPosts = await Product.countDocuments();
  const totalPages = Math.ceil(totalPosts / perPage);

  if (page > totalPages) {
    return res.status(404).json({ message: "Page not found" });
  }

  let productList = [];

  if (req.query.page !== "" && req.query.perPage !== "") {
    productList = await Product.find({
      location: req.query.location,
      subCatId: req.query.subCatId,
    })
      .populate("category")
      .skip((page - 1) * perPage)
      .limit(perPage)
      .exec();

    return res.status(200).json({
      products: productList,
      totalPages: totalPages,
      page: page,
    });
  } else {
    productList = await Product.find({
      location: req.query.location,
      subCatId: req.query.subCatId,
    });

    return res.status(200).json({
      products: productList,
    });
  }
});

router.get(`/fiterByPrice`, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(req.query.perPage);
  const totalPosts = await Product.countDocuments();
  const totalPages = Math.ceil(totalPosts / perPage);

  if (page > totalPages) {
    return res.status(404).json({ message: "Page not found" });
  }

  let productList = [];

  if (req.query.catId !== "" && req.query.catId !== undefined) {
    if (req.query.page !== "" && req.query.perPage !== "") {
      productList = await Product.find({
        catId: req.query.catId,
        location: req.query.location,
      })
        .populate("category")
        .skip((page - 1) * perPage)
        .limit(perPage)
        .exec();
    } else {
      productList = await Product.find({
        catId: req.query.catId,
        location: req.query.location,
      });
    }
  } else if (req.query.subCatId !== "" && req.query.subCatId !== undefined) {
    if (req.query.page !== "" && req.query.perPage !== "") {
      productList = await Product.find({
        subCatId: req.query.subCatId,
        location: req.query.location,
      })
        .populate("category")
        .skip((page - 1) * perPage)
        .limit(perPage)
        .exec();
    } else {
      productList = await Product.find({
        subCatId: req.query.subCatId,
        location: req.query.location,
      });
    }
  }

  const filteredProducts = productList.filter((product) => {
    if (req.query.minPrice && product.price < parseInt(+req.query.minPrice)) {
      return false;
    }
    if (req.query.maxPrice && product.price > parseInt(+req.query.maxPrice)) {
      return false;
    }
    return true;
  });

  return res.status(200).json({
    products: filteredProducts,
    totalPages: totalPages,
    page: page,
  });
});

router.get(`/rating`, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(req.query.perPage);
  const totalPosts = await Product.countDocuments();
  const totalPages = Math.ceil(totalPosts / perPage);

  if (page > totalPages) {
    return res.status(404).json({ message: "Page not found" });
  }

  let productList = [];

  if (req.query.catId !== "" && req.query.catId !== undefined) {
    if (req.query.page !== "" && req.query.perPage !== "") {
      productList = await Product.find({
        catId: req.query.catId,
        rating: req.query.rating,
        location: req.query.location,
      })
        .populate("category")
        .skip((page - 1) * perPage)
        .limit(perPage)
        .exec();
    } else {
      productList = await Product.find({
        catId: req.query.catId,
        rating: req.query.rating,
        location: req.query.location,
      });
    }
  } else if (req.query.subCatId !== "" && req.query.subCatId !== undefined) {
    if (req.query.page !== "" && req.query.perPage !== "") {
      productList = await Product.find({
        subCatId: req.query.subCatId,
        rating: req.query.rating,
        location: req.query.location,
      })
        .populate("category")
        .skip((page - 1) * perPage)
        .limit(perPage)
        .exec();
    } else {
      productList = await Product.find({
        subCatId: req.query.subCatId,
        rating: req.query.rating,
        location: req.query.location,
      });
    }
  }

  return res.status(200).json({
    products: productList,
    totalPages: totalPages,
    page: page,
  });
});

router.get(`/get/count`, async (req, res) => {
  const productsCount = await Product.countDocuments();

  if (!productsCount) {
    res.status(500).json({ success: false });
  } else {
    res.send({
      productsCount: productsCount,
    });
  }
});

router.get(`/featured`, async (req, res) => {
  let productList = "";
  if (
    req.query.location !== undefined &&
    req.query.location !== null &&
    req.query.location !== "All"
  ) {
    productList = await Product.find({
      isFeatured: true,
      location: req.query.location,
    });
  } else {
    productList = await Product.find({ isFeatured: true });
  }

  if (!productList) {
    res.status(500).json({ success: false });
  }

  return res.status(200).json(productList);
});

router.get(`/recentlyViewd`, async (req, res) => {
  let productList = [];
  productList = await RecentlyViewd.find(req.query).populate("category");

  if (!productList) {
    res.status(500).json({ success: false });
  }

  return res.status(200).json(productList);
});

router.post(`/recentlyViewd`, async (req, res) => {
  let findProduct = await RecentlyViewd.find({ prodId: req.body.id });

  var product;

  if (findProduct.length === 0) {
    product = new RecentlyViewd({
      prodId: req.body.id,
      name: req.body.name,
      description: req.body.description,
      images: req.body.images,
      brand: req.body.brand,
      price: req.body.price,
      oldPrice: req.body.oldPrice,
      subCatId: req.body.subCatId,
      catName: req.body.catName,
      subCat: req.body.subCat,
      category: req.body.category,
      countInStock: req.body.countInStock,
      rating: req.body.rating,
      isFeatured: req.body.isFeatured,
      discount: req.body.discount,
      productRam: req.body.productRam,
      size: req.body.size,
      productWeight: req.body.productWeight,
    });

    product = await product.save();

    if (!product) {
      res.status(500).json({
        error: err,
        success: false,
      });
    }

    res.status(201).json(product);
  }
});

router.post(`/create`, async (req, res) => {
  try {
    const category = await Category.findById(req.body.category);
    if (!category) {
      return res.status(404).json({
        message: "Invalid Category!",
        success: false,
      });
    }

    const images_Array = [];
    const uploadedImages = await ImageUpload.find();

    uploadedImages?.forEach((item) => {
      item.images?.forEach((image) => {
        images_Array.push(image);
      });
    });

    if (!req.body.name || !req.body.description || !req.body.countInStock) {
      return res.status(400).json({
        message: "Name, description, and countInStock are required fields!",
        success: false,
      });
    }

    const product = new Product({
      name: req.body.name,
      description: req.body.description,
      images: images_Array,
      webmetag: req.body.webmetag || "",
      brand: req.body.brand || "",
      price: req.body.price || 0,
      oldPrice: req.body.oldPrice || 0,
      catName: req.body.catName || "",
      catId: req.body.catId || "",
      subCatId: req.body.subCatId || "",
      subCat: req.body.subCat || "",
      subCatName: req.body.subCatName || "",
      category: req.body.category,
      countInStock: req.body.countInStock,
      rating: req.body.rating || 0,
      isFeatured: req.body.isFeatured || false,
      discount: req.body.discount || 0,
      productRam: req.body.productRam || [],
      size: req.body.size || [],
      productWeight: req.body.productWeight || [],
      location: req.body.location || "All",
    });

    const savedProduct = await product.save();

    if (!savedProduct) {
      return res.status(500).json({
        message: "Product could not be created!",
        success: false,
      });
    }

    imagesArr = [];

    return res.status(201).json({
      message: "Product created successfully!",
      success: true,
      product: savedProduct,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    return res.status(500).json({
      message: error.message || "Internal server error",
      success: false,
    });
  }
});

router.get("/:id", async (req, res) => {
  productEditId = req.params.id;

  const product = await Product.findById(req.params.id).populate("category");

  if (!product) {
    res
      .status(500)
      .json({ message: "The product with the given ID was not found." });
  }
  return res.status(200).send(product);
});

router.delete("/deleteImage", async (req, res) => {
  const imgUrl = req.query.img;

  // console.log(imgUrl)

  const urlArr = imgUrl.split("/");
  const image = urlArr[urlArr.length - 1];

  const imageName = image.split(".")[0];

  const response = await cloudinary.uploader.destroy(
    imageName,
    (error, result) => {}
  );

  if (response) {
    res.status(200).send(response);
  }
});

router.delete("/:id", async (req, res) => {
  const product = await Product.findById(req.params.id);
  const images = product.images;

  for (img of images) {
    const imgUrl = img;
    const urlArr = imgUrl.split("/");
    const image = urlArr[urlArr.length - 1];

    const imageName = image.split(".")[0];

    if (imageName) {
      cloudinary.uploader.destroy(imageName, (error, result) => {
        // console.log(error, result);
      });
    }

    //  console.log(imageName)
  }

  const deletedProduct = await Product.findByIdAndDelete(req.params.id);

  const myListItems = await MyList.find({ productId: req.params.id });

  for (var i = 0; i < myListItems.length; i++) {
    await MyList.findByIdAndDelete(myListItems[i].id);
  }

  const cartItems = await Cart.find({ productId: req.params.id });

  for (var i = 0; i < cartItems.length; i++) {
    await Cart.findByIdAndDelete(cartItems[i].id);
  }

  if (!deletedProduct) {
    res.status(404).json({
      message: "Product not found!",
      success: false,
    });
  }

  res.status(200).json({
    success: true,
    message: "Product Deleted!",
  });
});

router.put("/:id", async (req, res) => {
  try {
    // Validate if product exists
    const existingProduct = await Product.findById(req.params.id);
    if (!existingProduct) {
      return res.status(404).json({
        message: "Product not found!",
        success: false,
      });
    }

    // Validate category if provided
    if (req.body.category) {
      const category = await Category.findById(req.body.category);
      if (!category) {
        return res.status(404).json({
          message: "Invalid Category!",
          success: false,
        });
      }
    }

    // Update product with new schema fields
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      {
        name: req.body.name,
        description: req.body.description,
        images: req.body.images,
        webmetag: req.body.webmetag || "",
        brand: req.body.brand || "",
        price: req.body.price || 0,
        oldPrice: req.body.oldPrice || 0,
        catName: req.body.catName || "",
        catId: req.body.catId || "",
        subCatId: req.body.subCatId || "",
        subCat: req.body.subCat || "",
        subCatName: req.body.subCatName || "",
        category: req.body.category,
        countInStock: req.body.countInStock,
        rating: req.body.rating || 0,
        isFeatured: req.body.isFeatured || false,
        discount: req.body.discount || 0,
        productRam: req.body.productRam || [],
        size: req.body.size || [],
        productWeight: req.body.productWeight || [],
        location: req.body.location || "All",
      },
      { new: true }
    );

    if (!product) {
      return res.status(500).json({
        message: "Product could not be updated!",
        success: false,
      });
    }

    // Clear images array after successful update
    imagesArr = [];

    return res.status(200).json({
      message: "Product updated successfully!",
      success: true,
      product: product,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    return res.status(500).json({
      message: error.message || "Internal server error",
      success: false,
    });
  }
});

// router.get(`/`, async (req, res) => {
//   const page = parseInt(req.query.page) || 1;
//   const perPage = parseInt(req.query.perPage);
//   const totalPosts = await Product.countDocuments();
//   const totalPages = Math.ceil(totalPosts / perPage);

//   if (page > totalPages) {
//     return res.status(404).json({ message: "Page not found" });
//   }

//   let productList = [];

//   if (req.query.minPrice !== undefined && req.query.maxPrice !== undefined) {
//     if (
//       req.query.subCatId !== undefined &&
//       req.query.subCatId !== null &&
//       req.query.subCatId !== ""
//     ) {
//       if (
//         req.query.location !== undefined &&
//         req.query.location !== null &&
//         req.query.location !== "All"
//       ) {
//         productList = await Product.find({
//           subCatId: req.query.subCatId,
//           location: req.query.location,
//         })
//           .populate("category")
//           .skip((page - 1) * perPage)
//           .limit(perPage)
//           .exec();
//       } else {
//         productList = await Product.find({
//           subCatId: req.query.subCatId,
//         })
//           .populate("category")
//           .skip((page - 1) * perPage)
//           .limit(perPage)
//           .exec();
//       }
//     }

//     if (
//       req.query.catId !== undefined &&
//       req.query.catId !== null &&
//       req.query.catId !== ""
//     ) {
//       if (
//         req.query.location !== undefined &&
//         req.query.location !== null &&
//         req.query.location !== "All"
//       ) {
//         productList = await Product.find({
//           catId: req.query.catId,
//           location: req.query.location,
//         })
//           .populate("category")
//           .skip((page - 1) * perPage)
//           .limit(perPage)
//           .exec();
//       } else {
//         productList = await Product.find({ catId: req.query.catId })
//           .populate("category")
//           .skip((page - 1) * perPage)
//           .limit(perPage)
//           .exec();
//       }
//     }

//     const filteredProducts = productList.filter((product) => {
//       if (req.query.minPrice && product.price < parseInt(+req.query.minPrice)) {
//         return false;
//       }
//       if (req.query.maxPrice && product.price > parseInt(+req.query.maxPrice)) {
//         return false;
//       }
//       return true;
//     });

//     if (!productList) {
//       res.status(500).json({ success: false });
//     }
//     return res.status(200).json({
//       products: filteredProducts,
//       totalPages: totalPages,
//       page: page,
//     });
//   } else if (req.query.page !== undefined && req.query.perPage !== undefined) {
//     if (
//       req.query.location !== undefined &&
//       req.query.location !== null &&
//       req.query.location !== "All"
//     ) {
//       productList = await Product.find({ location: req.query.location })
//         .populate("category")
//         .skip((page - 1) * perPage)
//         .limit(perPage)
//         .exec();
//     } else {
//       productList = await Product.find()
//         .populate("category")
//         .skip((page - 1) * perPage)
//         .limit(perPage)
//         .exec();
//     }

//     if (!productList) {
//       res.status(500).json({ success: false });
//     }
//     return res.status(200).json({
//       products: productList,
//       totalPages: totalPages,
//       page: page,
//     });
//   } else {
//     if (
//       req.query.location !== undefined &&
//       req.query.location !== null &&
//       req.query.location !== "All"
//     ) {
//       productList = await Product.find(req.query)
//         .populate("category")
//         .skip((page - 1) * perPage)
//         .limit(perPage)
//         .exec();
//     } else if (
//       req.query.catId !== "" &&
//       req.query.catId !== null &&
//       req.query.catId !== undefined
//     ) {
//       productList = await Product.find({ catId: req.query.catId })
//         .populate("category")
//         .skip((page - 1) * perPage)
//         .limit(perPage)
//         .exec();
//     } else if (
//       req.query.catName !== "" &&
//       req.query.catName !== null &&
//       req.query.catName !== undefined
//     ) {
//       productList = await Product.find({ catName: req.query.catName })
//         .populate("category")
//         .skip((page - 1) * perPage)
//         .limit(perPage)
//         .exec();
//     } else if (
//       req.query.subCatId !== "" &&
//       req.query.subCatId !== null &&
//       req.query.subCatId !== undefined
//     ) {
//       productList = await Product.find({
//         subCatId: req.query.subCatId,
//       })
//         .populate("category")
//         .skip((page - 1) * perPage)
//         .limit(perPage)
//         .exec();
//     }

//     if (
//       req.query.rating !== "" &&
//       req.query.rating !== null &&
//       req.query.rating !== undefined
//     ) {
//       if (
//         req.query.catId !== "" &&
//         req.query.catId !== null &&
//         req.query.catId !== undefined
//       ) {
//         if (
//           req.query.location !== undefined &&
//           req.query.location !== null &&
//           req.query.location !== "All"
//         ) {
//           productList = await Product.find({
//             rating: req.query.rating,
//             catId: req.query.catId,
//             location: req.query.location,
//           }).populate("category").skip((page - 1) * perPage)
//           .limit(perPage)
//           .exec();
//         } else {
//           productList = await Product.find({
//             rating: req.query.rating,
//             catId: req.query.catId,
//           }).populate("category").skip((page - 1) * perPage)
//           .limit(perPage)
//           .exec();
//         }
//       }
//     }

//     if (
//       req.query.rating !== "" &&
//       req.query.rating !== null &&
//       req.query.rating !== undefined
//     ) {
//       if (
//         req.query.subCatId !== "" &&
//         req.query.subCatId !== null &&
//         req.query.subCatId !== undefined
//       ) {
//         if (
//           req.query.location !== undefined &&
//           req.query.location !== null &&
//           req.query.location !== "All"
//         ) {
//           productList = await Product.find({
//             rating: req.query.rating,
//             subCatId: req.query.subCatId,
//             location: req.query.location,
//           }).populate("category").skip((page - 1) * perPage)
//           .limit(perPage)
//           .exec();
//         } else {
//           productList = await Product.find({
//             rating: req.query.rating,
//             subCatId: req.query.subCatId,
//           }).populate("category").skip((page - 1) * perPage)
//           .limit(perPage)
//           .exec();
//         }
//       }
//     }

//     if (!productList) {
//       res.status(500).json({ success: false });
//     }

//     return res.status(200).json({
//       products: productList,
//       totalPages: totalPages,
//       page: page,
//     });
//   }
// });

module.exports = router;
