const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ email, subject, message }) => {
  try {
    console.log("📧 Sending email via Resend...");
    console.log(
      "📧 Resend API key configured:",
      !!process.env.RESEND_API_KEY
    );

    const { data, error } = await resend.emails.send({
      from: "NestLink <onboarding@resend.dev>",
      to: [email],
      subject,
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
    throw error;
  }
};

module.exports = sendEmail;
