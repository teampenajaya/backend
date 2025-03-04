const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy untuk aplikasi yang di-deploy di layanan seperti Render/Heroku
app.set("trust proxy", 1);

// Middleware keamanan
app.use(helmet());
app.use(cookieParser(process.env.COOKIE_SECRET || "rahasia-penaslot-cookie"));
app.use(bodyParser.json({ limit: "100kb" }));

// Konfigurasi CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : ["https://laporanpenaslot.info"];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true, // Izinkan pengiriman cookie
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 10, // Batas 10 permintaan per IP
  message: { success: false, message: "Too many requests." },
});

// Store untuk token CSRF
const tokenStore = new Map();

// Fungsi untuk membuat token CSRF yang aman
const generateSecureToken = () => {
  return {
    token: crypto.randomBytes(32).toString("hex"),
    expires: Date.now() + 30 * 60 * 1000, // 30 menit
  };
};

// Endpoint untuk mendapatkan CSRF token
app.get("/get-csrf-token", (req, res) => {
  const sessionId = req.cookies.sessionId || crypto.randomBytes(16).toString("hex");
  const tokenData = generateSecureToken();

  // Simpan token di server
  tokenStore.set(sessionId, tokenData);

  console.log("Stored Token Data:", tokenStore.get(sessionId));

  // Bersihkan token yang kedaluwarsa
  for (const [key, data] of tokenStore.entries()) {
    if (data.expires < Date.now()) {
      tokenStore.delete(key);
    }
  }

  // Set cookie untuk session dan CSRF token
  res.cookie("sessionId", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 60 * 1000,
  });

  res.cookie("csrfToken", tokenData.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 60 * 1000,
  });

  res.status(200).json({ success: true });
});

// Middleware untuk validasi CSRF token
const validateCsrfToken = (req, res, next) => {
  const sessionId = req.cookies.sessionId;
  const csrfToken = req.cookies.csrfToken;

  console.log("CSRF Token:", csrfToken);
  console.log("Session ID:", sessionId);

  if (!sessionId || !csrfToken) {
    return res.status(403).json({
      success: false,
      message: "Gagal memverifikasi permintaan. Coba lagi.", //Access denied. Invalid security token
    });
  }

  const storedTokenData = tokenStore.get(sessionId);

  if (!storedTokenData || storedTokenData.token !== csrfToken || storedTokenData.expires < Date.now()) {
    return res.status(403).json({
      success: false,
      message: "Token CSRF tidak valid atau kedaluwarsa.", //Access denied. Invalid or expired security token
    });
  }

  next();
};

// Endpoint untuk mengirim pengaduan
app.post("/send-complaint", limiter, validateCsrfToken, (req, res) => {
  try {
    const { username, email, gameId, platform, issueType, description, dateOfIssue, phoneNumber } = req.body;

    // Validasi input
    const validationErrors = {};

    if (!username || username.length < 3 || username.length > 50) validationErrors.username = "Username tidak valid";
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) validationErrors.email = "Email tidak valid";
    if (!issueType) validationErrors.issueType = "Jenis keluhan tidak valid";
    if (!description || description.length > 2000) validationErrors.description = "Deskripsi tidak valid";
    if (!dateOfIssue || new Date(dateOfIssue) > new Date()) validationErrors.dateOfIssue = "Tanggal tidak valid";
    if (!phoneNumber || !/^\+?[0-9]{10,15}$/.test(phoneNumber)) validationErrors.phoneNumber = "Nomor telepon tidak valid";

    if (Object.keys(validationErrors).length > 0) {
      return res.status(400).json({
        success: false,
        message: "Data tidak valid",
        errors: validationErrors,
      });
    }

    // Generate reference number
    const refNumber = `PENA-${Date.now().toString().slice(-8)}`;

    // Kirim email
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: "teampenaslot@gmail.com",
      subject: `PENASLOT Complaint: ${issueType} - ${username} - ${refNumber}`,
      text: `
PENASLOT Customer Complaint

Nomor Referensi: ${refNumber}
Username: ${username}
Email: ${email}
Nomor Whatsapp: ${phoneNumber}
Platform: ${platform}
Jenis Kendala: ${issueType}
Game ID: ${gameId || "N/A"}
Tanggal: ${dateOfIssue}

Description:
${description}
      `,
    };

    transport.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
        return res.status(500).json({ success: false, message: "Gagal mengirim email" });
      }

      // Hapus token setelah digunakan
      const sessionId = req.cookies.sessionId;
      if (sessionId) {
        tokenStore.delete(sessionId);
      }

      res.status(200).json({ success: true, referenceNumber: refNumber });
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan pada server" });
  }
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
