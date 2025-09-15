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
    console.error("Signature verification error:", error);
    return false;
  }
};

const ZiinaPay = async (data) => {
  try {
    // Create payment intent with Ziina API
    const paymentData = {
      amount: data.amount * 100, // Convert AED to fils (smallest currency unit)
      currency_code: "AED", // or get from data.currency
      message: `Order payment for ${data.name}`,
      success_url: `${process.env.CLIENT_BASE_URL}/payment/success`,
      cancel_url: `${process.env.CLIENT_BASE_URL}/payment/cancel`,
      failure_url: `${process.env.CLIENT_BASE_URL}/payment/failure`,
      test: process.env.NODE_ENV !== "production", // true for development
      expiry: (Date.now() + 24 * 60 * 60 * 1000).toString(), // 24 hours from now as timestamp in milliseconds
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
    return {
      success: true,
      paymentUrl: paymentIntent.payment_url, // The URL user needs to visit to pay
      orderId: savedOrder._id,
      paymentIntentId: paymentIntent.id,
      message: "Payment intent created successfully",
    };
  } catch (error) {
    console.error("ZiinaPay error:", error);
    return {
      success: false,
      error: error.message,
      message: "Something went wrong",
    };
  }
};

const ZiinaHook = async (req, res) => {
  try {
    const event = req.body;
    const signature = req.headers["x-hmac-signature"];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    console.log("Ziina webhook received:", event);
    console.log("Headers:", req.headers);

    // Verify webhook signature if secret key is configured
    if (ZIINA_SECRET_KEY) {
      if (!signature) {
        console.error("Missing X-Hmac-Signature header");
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
        console.error("Invalid webhook signature");
        return res.status(401).json({
          success: false,
          message: "Invalid signature",
        });
      }

      console.log("Webhook signature verified successfully");
    } else {
      console.warn(
        "ZIINA_SECRET_KEY not configured - webhook signature verification skipped"
      );
    }

    if (event.object === "payment_intent" && event.status && event.id) {
      console.log(`Payment Intent ${event.id} updated to ${event.status}`);

      // Find the order by payment ID
      const order = await Orders.findOne({ paymentId: event.id });

      if (!order) {
        console.log(`No order found for payment ID: ${event.id}`);
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      let newStatus;
      let shouldRemoveExpiry = false;

      switch (event.status) {
        case "succeeded":
          // ✅ mark order as confirmed/paid
          newStatus = "confirmed";
          shouldRemoveExpiry = true;
          console.log(
            `Order ${order._id} payment succeeded - marking as confirmed`
          );
          break;

        case "failed":
          // ❌ mark order as failed
          newStatus = "failed";
          shouldRemoveExpiry = true;
          console.log(`Order ${order._id} payment failed`);
          break;

        case "cancelled":
          // 🚫 mark order as cancelled
          newStatus = "cancelled";
          shouldRemoveExpiry = true;
          console.log(`Order ${order._id} payment cancelled`);
          break;

        default:
          console.log("Unhandled payment status:", event.status);
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

      console.log(`Order ${order._id} updated successfully:`, {
        previousStatus: order.status,
        newStatus: newStatus,
        paymentId: event.id,
      });

      return res.status(200).json({
        success: true,
        message: "Order updated successfully",
        orderId: updatedOrder._id,
        status: updatedOrder.status,
      });
    } else {
      console.log("Invalid webhook payload:", event);
      return res.status(400).json({
        success: false,
        message: "Invalid webhook payload",
      });
    }
  } catch (error) {
    console.error("ZiinaHook error:", error);
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

router.post(
  "/webhook/ziina",
  express.raw({ type: "application/json" }),
  (req, res) => {
    try {
      const rawBody = req.body.toString("utf8");
      req.body = JSON.parse(rawBody);
      req.rawBody = rawBody;
      ZiinaHook(req, res);
    } catch (error) {
      console.error("Failed to parse webhook body:", error);
      res.status(400).json({
        success: false,
        message: "Invalid JSON payload",
      });
    }
  }
);

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
