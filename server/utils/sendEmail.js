const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },

  // Prevent the request from hanging for minutes
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

const sendEmail = async ({ email, subject, message }) => {
  try {
    console.log("📧 Attempting to send email...");
    console.log("📧 Email user configured:", !!process.env.EMAIL_USER);
    console.log("📧 Email password configured:", !!process.env.EMAIL_PASS);

    await transporter.sendMail({
      from: `"NestLink" <${process.env.EMAIL_USER}>`,
      to: email,
      subject,
      html: message,
    });

    console.log("✅ Password reset email sent successfully");
  } catch (error) {
    console.error("❌ Email sending failed:");
    console.error("Code:", error.code);
    console.error("Command:", error.command);
    console.error("Message:", error.message);

    throw error;
  }
};

module.exports = sendEmail;
