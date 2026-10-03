const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

<<<<<<< HEAD
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

=======
const sendEmail = async ({ email, subject, message }) => {
  try {
    console.log("📧 Sending email via Resend...");
    console.log("📧 Resend API key configured:", !!process.env.RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      from: "NestLink <onboarding@resend.dev>",
      to: [email],
      subject: subject,
      html: message,
    });

    if (error) {
      console.error("❌ Resend error:", error);
      throw new Error(error.message || "Failed to send email");
    }

    console.log("✅ Email sent successfully:", data.id);

    return data;
  } catch (error) {
    console.error("❌ Email sending failed:", error.message);
>>>>>>> 3398c8b (Replace Gmail SMTP with Resend email API)
    throw error;
  }
};

module.exports = sendEmail;
