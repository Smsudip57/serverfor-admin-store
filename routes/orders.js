const { Orders } = require("../models/orders");
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const ZIINA_API_KEY = process.env.ZIINA_API_KEY;
const ZIINA_SECRET_KEY = process.env.ZIINA_SECRET_KEY;

// Function to verify Ziina webhook signature
const verifyZiinaSignature = (rawBody, signature, secret) => {
  if (!signature || !secret) {
    return false;
  }

  try {
    // Compute HMAC-SHA256 of the raw request body
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");

    // Compare signatures using secure comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch (error) {
    return false;
  }
};

const ZiinaPay = async (data) => {
  try {
    // Create payment intent with Ziina API
    const paymentData = {
      amount: data.amount * 100,
      currency_code: "AED",
      message: `Order payment for ${data.name}`,
      success_url: `${process.env.CLIENT_BASE_URL}/payment/success`,
      cancel_url: `${process.env.CLIENT_BASE_URL}/payment/cancel`,
      failure_url: `${process.env.CLIENT_BASE_URL}/payment/failure`,
      test: process.env.NODE_ENV !== "production",
      expiry: (Date.now() + 24 * 60 * 60 * 1000).toString(),
      allow_tips: false,
    };

    const options = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ZIINA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paymentData),
    };

    // Call Ziina API
    const response = await fetch(
      "https://api-v2.ziina.com/api/payment_intent",
      options
    );
    const paymentIntent = await response.json();

    if (!response.ok) {
      throw new Error(
        `Ziina API error: ${
          paymentIntent.message || "Payment intent creation failed"
        }`
      );
    }

    // Create pending order in database
    const order = new Orders({
      name: data.name,
      phoneNumber: data.phoneNumber,
      address: data.address,
      pincode: data.pincode,
      amount: data.amount,
      paymentId: paymentIntent.id, // Use Ziina payment intent ID
      email: data.email,
      userid: data.userid,
      products: data.products,
      status: "pending", // Order starts as pending
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expire in 24 hours
    });

    const savedOrder = await order.save();

    // Return payment URL and order info
    const result = {
      success: true,
      paymentUrl: paymentIntent.redirect_url, // Ziina uses redirect_url, not payment_url
      orderId: savedOrder._id,
      paymentIntentId: paymentIntent.id,
      message: "Payment intent created successfully",
    };

    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: "Something went wrong",
    };
  }
};

const ZiinaHook = async (req, res) => {
  try {
    const clientIP =
      req.headers["x-real-ip"] ||
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim();

    // Ziina authorized IP addresses
    const allowedIPs = ["3.29.184.186", "3.29.190.95", "20.233.47.127"];

    // Validate IP address
    if (!clientIP || !allowedIPs.includes(clientIP)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Invalid IP address",
      });
    }

    const event = req.body;
    const signature = req.headers["x-hmac-signature"];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    // Verify webhook signature if secret key is configured
    if (ZIINA_SECRET_KEY) {
      if (!signature) {
        return res.status(401).json({
          success: false,
          message: "Missing signature header",
        });
      }

      const isValidSignature = verifyZiinaSignature(
        rawBody,
        signature,
        ZIINA_SECRET_KEY
      );

      if (!isValidSignature) {
        return res.status(401).json({
          success: false,
          message: "Invalid signature",
        });
      }
    }

    if (
      event.event === "payment_intent.status.updated" &&
      event.data &&
      event.data.id &&
      event.data.status
    ) {
      const paymentData = event.data;

      // Find the order by payment ID
      const order = await Orders.findOne({ paymentId: paymentData.id });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      let newStatus;
      let shouldRemoveExpiry = false;

      switch (paymentData.status) {
        case "completed":
        case "succeeded":
          newStatus = "confirmed";
          shouldRemoveExpiry = true;
          break;

        case "failed":
          newStatus = "failed";
          shouldRemoveExpiry = true;
          break;

        case "cancelled":
          newStatus = "cancelled";
          shouldRemoveExpiry = true;
          break;

        default:
          return res.status(200).json({
            success: true,
            message: "Status not handled",
          });
      }

      // Update order status
      const updateData = { status: newStatus };

      // Remove expiry for completed payments (success, failed, cancelled)
      if (shouldRemoveExpiry) {
        updateData.$unset = { expiresAt: 1 };
      }

      const updatedOrder = await Orders.findByIdAndUpdate(
        order._id,
        updateData,
        { new: true }
      );

      return res.status(200).json({
        success: true,
        message: "Order updated successfully",
        orderId: updatedOrder._id,
        status: updatedOrder.status,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook payload",
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      message: "Webhook processing failed",
    });
  }
};

router.get(`/`, async (req, res) => {
  try {
    const ordersList = await Orders.find(req.query);

    if (!ordersList) {
      res.status(500).json({ success: false });
    }

    return res.status(200).json(ordersList);
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

router.get("/:id", async (req, res) => {
  const order = await Orders.findById(req.params.id);

  if (!order) {
    res
      .status(500)
      .json({ message: "The order with the given ID was not found." });
  }
  return res.status(200).send(order);
});

router.get(`/get/count`, async (req, res) => {
  const orderCount = await Orders.countDocuments();

  if (!orderCount) {
    res.status(500).json({ success: false });
  } else {
    res.send({
      orderCount: orderCount,
    });
  }
});

router.post("/create", async (req, res) => {
  try {
    const result = await ZiinaPay(req.body);

    if (result.success) {
      res.status(201).json({
        success: true,
        paymentUrl: result.paymentUrl,
        orderId: result.orderId,
        paymentIntentId: result.paymentIntentId,
        message: result.message,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Internal server error",
    });
  }
});

router.post("/webhook/ziina", (req, res) => {
  try {
    ZiinaHook(req, res);
  } catch (error) {
    console.error("Failed to process webhook:", error);
    res.status(400).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
});

router.delete("/:id", async (req, res) => {
  const deletedOrder = await Orders.findByIdAndDelete(req.params.id);

  if (!deletedOrder) {
    res.status(404).json({
      message: "Order not found!",
      success: false,
    });
  }

  res.status(200).json({
    success: true,
    message: "Order Deleted!",
  });
});

router.put("/:id", async (req, res) => {
  const updateData = {
    name: req.body.name,
    phoneNumber: req.body.phoneNumber,
    address: req.body.address,
    pincode: req.body.pincode,
    amount: req.body.amount,
    paymentId: req.body.paymentId,
    email: req.body.email,
    userid: req.body.userid,
    products: req.body.products,
    status: req.body.status,
  };

  // Handle expiry based on status
  if (req.body.status === "pending") {
    // If changing TO pending, set expiry (24 hours)
    updateData.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  } else if (req.body.status && req.body.status !== "pending") {
    // If changing FROM pending to confirmed/delivered, remove expiry
    updateData.$unset = { expiresAt: 1 };
  }

  const order = await Orders.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
  });

  if (!order) {
    return res.status(500).json({
      message: "Order cannot be updated!",
      success: false,
    });
  }

  res.send(order);
});

module.exports = router;
