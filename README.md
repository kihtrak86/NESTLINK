# # 🔖 NestLink — Smart Bookmark Manager

![React](https://img.shields.io/badge/Frontend-React.js-61DAFB?logo=react&logoColor=white)
![Tailwind](https://img.shields.io/badge/Styling-TailwindCSS-38B2AC?logo=tailwind-css&logoColor=white)
![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Framework-Express.js-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/Database-MongoDB-47A248?logo=mongodb&logoColor=white)

---

## 📌 Overview

**NestLink** is a bookmark management web application that helps users securely save, organize, and manage website links using custom folders, tags, and search.

---

## ✨ Features

### 🔐 Authentication

- User Signup & Login
- JWT Authentication
- Forgot & Reset Password

### 🔖 Bookmark Management

- Add, Edit & Delete Bookmarks
- URL Validation
- Search & Pagination

### 📁 Folder Management

- Create & Delete Custom Folders
- Organize Bookmarks

### 🎨 User Experience

- Dark Mode
- Responsive Design
- Modern UI

---

## 🛠 Tech Stack

| Category | Technology |
|----------|------------|
| **Frontend** | React.js, Vite, Tailwind CSS |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB |
| **Authentication** | JWT, bcrypt |
| **Email Service** | Resend |
| **HTTP Client** | Axios |
| **Deployment** | Vercel & Render |

---

## 📂 Folder Structure

```text
NestLink/
├── client/
│   ├── src/
│   ├── package.json
│   ├── vite.config.js
│   └── vercel.json
│
├── server/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── utils/
│   ├── server.js
│   └── package.json
│
├── .gitignore
└── README.md
```

---

## 🚀 Installation

### Backend

```bash
cd server
npm install
npm run dev
```

### Frontend

```bash
cd client
npm install
npm run dev
```

---

## 🔐 Environment Variables

Create a `.env` file inside the `server` folder:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
RESEND_API_KEY=your_resend_api_key
```

> ⚠️ Never commit your `.env` file or expose your API keys publicly.

---

## 🌐 Live Demo

**Frontend:** https://nestlink-indol.vercel.app

---

## 🚀 Deployment

- **Frontend:** Vercel
- **Backend:** Render
- **Database:** MongoDB Atlas
- **Email Service:** Resend

---

## 👨‍💻 Author

**Karthik**

GitHub: https://github.com/kihtrak86

---

## 📄 License

This project is for educational and personal use.
🔖 NestLink — Smart Bookmark Manager

![React](https://img.shields.io/badge/Frontend-React.js-61DAFB?logo=react&logoColor=white)
![Tailwind](https://img.shields.io/badge/Styling-TailwindCSS-38B2AC?logo=tailwind-css&logoColor=white)
![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Framework-Express.js-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/Database-MongoDB-47A248?logo=mongodb&logoColor=white)

---

## 📌 Overview

**NestLink** is a bookmark management web application that helps users securely save, organize, and manage website links using custom folders, tags, and search.

---

## ✨ Features

### 🔐 Authentication
- User Signup & Login
- JWT Authentication
- Forgot & Reset Password

### 🔖 Bookmark Management
- Add, Edit & Delete Bookmarks
- URL Validation
- Search & Pagination

### 📁 Folder Management
- Create & Delete Custom Folders
- Organize Bookmarks

### 🎨 User Experience
- Dark Mode
- Responsive Design
- Modern UI

---

## 🛠 Tech Stack

| **Category** | **Technology** |
|--------------|----------------|
| **Frontend** | React.js, Vite, Tailwind CSS |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB |
| **Authentication** | JWT |
| **Email Service** | Nodemailer |

---

## 📂 Folder Structure

```bash
NestLink/
├── client/
├── server/
├── .gitignore
└── README.md
```

---

## 🚀 Installation

### Backend

```bash
cd server
npm install
npm run dev
```

### Frontend

```bash
cd client
npm install
npm run dev
```
