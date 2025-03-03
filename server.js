const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

// Konfigurasi Mailtrap
const transport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER, // Menggunakan environment variable
    pass: process.env.GMAIL_PASS, // Menggunakan environment variable
  },
});

app.post("/send-complaint", (req, res) => {
  const { username, email, gameId, platform, issueType, description, dateOfIssue, phoneNumber } = req.body;

  // Validasi data
  if (!username || !email || !issueType || !description || !dateOfIssue || !phoneNumber) {
    return res.status(400).json({ success: false, message: "Data tidak lengkap" });
  }

  // Generate reference number
  const refNumber = `PENA-${Date.now().toString().slice(-8)}`;

  // Konfigurasi email
  const mailOptions = {
    from: process.env.GMAIL_USER, // Email pengirim
    to: "teampenaslot@gmail.com", // Email penerima
    subject: `PENASLOT Complaint: ${issueType} - ${username} - ${refNumber}`,
    text: `
PENASLOT Customer Complaint

Reference Number: ${refNumber}
Username: ${username}
Email: ${email}
Phone Number: ${phoneNumber}
Platform: ${platform}
Issue Type: ${issueType}
Game ID: ${gameId || "N/A"}
Date of Issue: ${dateOfIssue}

Description:
${description}
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
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});