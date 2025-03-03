const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(
  cors({
    origin: ['https://laporanpenaslot.pages.dev', 'http://localhost:3000'], // Add your domains here
    methods: ["POST"],
    credentials: true
  })
);
app.use(bodyParser.json({ limit: "100kb" })); // Limit payload size

// Rate limiting
const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: { success: false, message: "Terlalu banyak permintaan, coba lagi nanti" },
});
app.use("/send-complaint", limiter);

// Validation helper functions
const validators = {
  username: (value) => {
    return typeof value === "string" && value.trim().length >= 3 && value.trim().length <= 50 && /^[a-zA-Z0-9_]+$/.test(value);
  },
  email: (value) => {
    return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 100;
  },
  gameId: (value) => {
    // Optional field
    if (!value) return true;
    return typeof value === "string" && value.trim().length <= 50 && /^[a-zA-Z0-9-_]+$/.test(value);
  },
  platform: (value) => {
    return value === "PENASLOT"; // Only allow this specific value
  },
  issueType: (value) => {
    const validIssueTypes = ["Deposit/Penarikan Bermasalah", "Kerusakan Game", "Masalah Akses Akun", "Masalah Bonus/Promosi", "Kesalahan Proses Pembayaran", "Logout Tiba-tiba", "Masalah Pembayaran Jackpot", "Lainnya"];
    return typeof value === "string" && validIssueTypes.includes(value);
  },
  description: (value) => {
    return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 2000;
  },
  dateOfIssue: (value) => {
    // Check if it's a valid date and not in the future
    const date = new Date(value);
    const today = new Date();
    return !isNaN(date.getTime()) && date <= today;
  },
  phoneNumber: (value) => {
    // Must be a string that contains only numbers, possibly with + at the beginning
    // Must be between 10-15 digits (common for international numbers)
    return typeof value === "string" && /^\+?[0-9]{10,15}$/.test(value);
  },
};

// Sanitize helper function
const sanitize = (input) => {
  if (typeof input === "string") {
    // Remove HTML/script tags and limit length
    return input.replace(/<\/?[^>]+(>|$)/g, "").trim();
  }
  return input;
};

// Konfigurasi Mailtrap
const transport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER, // Menggunakan environment variable
    pass: process.env.GMAIL_PASS, // Menggunakan environment variable
  },
});

app.post("/send-complaint", (req, res) => {
  try {
    const { username, email, gameId, platform, issueType, description, dateOfIssue, phoneNumber } = req.body;

    // Validate all fields
    const validationErrors = {};

    if (!validators.username(username)) validationErrors.username = "Username tidak valid";
    if (!validators.email(email)) validationErrors.email = "Email tidak valid";
    if (!validators.platform(platform)) validationErrors.platform = "Platform tidak valid";
    if (!validators.issueType(issueType)) validationErrors.issueType = "Jenis issue tidak valid";
    if (!validators.description(description)) validationErrors.description = "Deskripsi tidak valid";
    if (!validators.dateOfIssue(dateOfIssue)) validationErrors.dateOfIssue = "Tanggal masalah tidak valid";
    if (!validators.phoneNumber(phoneNumber)) validationErrors.phoneNumber = "Nomor telepon tidak valid";
    if (!validators.gameId(gameId)) validationErrors.gameId = "ID game tidak valid";

    // If validation errors exist, return them
    if (Object.keys(validationErrors).length > 0) {
      return res.status(400).json({
        success: false,
        message: "Data tidak valid",
        errors: validationErrors,
      });
    }

    // Sanitize inputs
    const sanitizedData = {
      username: sanitize(username),
      email: sanitize(email),
      gameId: sanitize(gameId),
      platform: sanitize(platform),
      issueType: sanitize(issueType),
      description: sanitize(description),
      dateOfIssue: sanitize(dateOfIssue),
      phoneNumber: sanitize(phoneNumber),
    };

    // Generate reference number
    const refNumber = `PENA-${Date.now().toString().slice(-8)}`;

    // Konfigurasi email
    const mailOptions = {
      from: process.env.GMAIL_USER, // Email pengirim
      to: "teampenaslot@gmail.com", // Email penerima
      subject: `PENASLOT Complaint: ${sanitizedData.issueType} - ${sanitizedData.username} - ${refNumber}`,
      text: `
PENASLOT Customer Complaint

Nomor Referensi: ${refNumber}
Username: ${sanitizedData.username}
Email: ${sanitizedData.email}
Nomor Whatsapp: ${sanitizedData.phoneNumber}
Platform: ${sanitizedData.platform}
Jenis Kendala: ${sanitizedData.issueType}
Game ID: ${sanitizedData.gameId || "N/A"}
Tanggal: ${sanitizedData.dateOfIssue}

Description:
${sanitizedData.description}
      `,
    };

    // Kirim email
    transport.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
        return res.status(500).json({ success: false, message: "Gagal mengirim email" });
      }
      console.log("Email sent:", info.response);
      res.status(200).json({ success: true, referenceNumber: refNumber });
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan pada server" });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: "Terjadi kesalahan pada server" });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});