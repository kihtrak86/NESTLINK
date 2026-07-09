const jwt = require("jsonwebtoken");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
});

// @desc  Register a new user
// @route POST /api/auth/signup
const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Name, email, and password are all required" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "An account with this email already exists" });
    }

    const user = await User.create({ name, email, password });
    const token = generateToken(user._id);

    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(", ") });
    }
    res
      .status(500)
      .json({ message: "Failed to sign up", error: error.message });
  }
};

// @desc  Log in an existing user
// @route POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password",
    );
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = generateToken(user._id);
    res.status(200).json({ token, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ message: "Failed to log in", error: error.message });
  }
};

// @desc  Get current logged-in user
// @route GET /api/auth/me
const getMe = async (req, res) => {
  res.status(200).json({ user: sanitizeUser(req.user) });
};

// @desc  Request a password reset — generates a token and (in this demo
//        project) returns it directly instead of emailing it.
// @route POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Always respond with the same generic message, whether or not the
    // email exists, so we don't leak which emails have accounts.
    const genericResponse = {
      message:
        "If an account exists for that email, a reset link has been generated.",
    };

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const resetToken = user.generateResetToken();
    await user.save({ validateBeforeSave: false });

    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const resetUrl = `${clientUrl}/reset-password/${resetToken}`;

    // NOTE: This project has no email service wired up. In production,
    // send `resetUrl` via an email provider (e.g. Nodemailer + SMTP,
    // SendGrid, Resend). For now we log it and return it in the response
    // so the flow is fully testable end-to-end without extra setup.
    const message = `
     <h2>Password Reset</h2>

<p>You requested a password reset.</p>

<p>
<a href="${resetUrl}">
Reset Password
</a>
</p>

<p>If you didn't request this, simply ignore this email.</p>
`;

    await sendEmail({
      email: user.email,
      subject: "NestLink Password Reset",
      message,
    });

    res.status(200).json(genericResponse);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to process request", error: error.message });
  }
};

// @desc  Reset password using a valid token
// @route PUT /api/auth/reset-password/:token
const resetPassword = async (req, res) => {
  try {
    const crypto = require("crypto");
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    }).select("+password +resetPasswordToken +resetPasswordExpire");

    if (!user) {
      return res
        .status(400)
        .json({ message: "Reset link is invalid or has expired" });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    const token = generateToken(user._id);
    res.status(200).json({ token, user: sanitizeUser(user) });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to reset password", error: error.message });
  }
};

module.exports = { signup, login, getMe, forgotPassword, resetPassword };
