// ====================================================
// Toolkit Pro - Main Server File
// Final Version - Production Ready
// ====================================================

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

// ডাটাবেস এবং রেডিস কানেকশন ইমপোর্ট
const database = require("./database");
// const redisClient = require("./redis"); // রেডিস ব্যবহার করলে আনকমেন্ট করুন

dotenv.config();

const app = express();

// Render.com এর জন্য পোর্ট এবং হোস্ট
const PORT = process.env.PORT || 10000;
const HOST = "0.0.0.0";

// ====================================================
// Security Middleware
// ====================================================
app.use(helmet({
    contentSecurityPolicy: false, // ফ্রন্টএন্ডে ইনলাইন স্ক্রিপ্ট (AdSense) থাকলে false
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS Configuration (ডকুমেন্টের Page 43 অনুযায়ী)
app.use(cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    credentials: true,
    maxAge: 86400,
}));

// Compression (পারফরম্যান্সের জন্য)
app.use(compression());

// Body Parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ====================================================
// Request Logging Middleware
// ====================================================
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        if (req.path.startsWith("/api")) {
            console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
        }
    });
    next();
});

// ====================================================
// Static Files (Public Folder)
// ====================================================
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

// ====================================================
// Health Check Route (Render.com এর জন্য অত্যন্ত জরুরি)
// ====================================================
app.get("/health", async (req, res) => {
    try {
        let dbStatus = false;
        let dbTime = null;
        
        try {
            dbTime = await database.checkConnection();
            dbStatus = !!dbTime;
        } catch (e) {
            dbStatus = false;
        }

        res.status(200).json({
            success: true,
            message: "Server is healthy",
            data: {
                status: "healthy",
                uptime: process.uptime(),
                database: dbStatus ? "connected" : "disconnected",
                databaseTime: dbTime,
                environment: process.env.NODE_ENV || "production",
                port: PORT,
                memory: process.memoryUsage(),
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Health check failed",
            error: error.message,
        });
    }
});

// ====================================================
// API Routes
// ====================================================
try {
    app.use("/api/v1/tools", require("./routes/tools"));
    app.use("/api/v1/auth", require("./routes/auth"));
    app.use("/api/v1", require("./routes/api"));
    console.log("✅ API routes loaded successfully");
} catch (error) {
    console.warn("⚠️ API routes loading failed:", error.message);
}

// ====================================================
// HTML Page Routes (Fallback for SPA / Static Pages)
// ====================================================
const htmlPages = [
    { route: "/tools", file: "tools.html" },
    { route: "/tool", file: "tool.html" },
    { route: "/categories", file: "categories.html" },
    { route: "/about", file: "about.html" },
    { route: "/contact", file: "contact.html" },
    { route: "/privacy", file: "privacy.html" },
    { route: "/terms", file: "terms.html" },
];

htmlPages.forEach(page => {
    app.get(page.route, (req, res) => {
        const filePath = path.join(publicPath, page.file);
        if (fs.existsSync(filePath)) {
            return res.sendFile(filePath);
        }
        res.redirect("/");
    });
});

// Root Route (Homepage)
app.get("/", (req, res) => {
    const indexPath = path.join(publicPath, "index.html");
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }
    res.json({
        success: true,
        message: "Toolkit Pro API Server",
        data: {
            name: "Toolkit Pro",
            version: "2.0.0",
            status: "running",
            health: "/health",
            api: "/api/v1",
            tools: "/tools.html",
        },
    });
});

// ====================================================
// 404 Handler
// ====================================================
app.use((req, res) => {
    const notFoundPath = path.join(publicPath, "404.html");
    if (fs.existsSync(notFoundPath)) {
        return res.status(404).sendFile(notFoundPath);
    }
    res.status(404).json({
        success: false,
        message: "Route not found",
        path: req.originalUrl,
        method: req.method,
    });
});

// ====================================================
// Global Error Handler
// ====================================================
app.use((err, req, res, next) => {
    console.error("❌ Global Error:", err.message);
    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Internal server error",
        ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {}),
    });
});

// ====================================================
// Server Startup & Database Seeding
// ====================================================
async function startServer() {
    try {
        console.log("=".repeat(60));
        console.log("🚀 Toolkit Pro Server Starting...");
        console.log("=".repeat(60));
        console.log(`🌍 Environment: ${process.env.NODE_ENV || "production"}`);
        console.log(`🔌 Port: ${PORT}`);
        console.log(`📡 Host: ${HOST}`);
        console.log(`📁 Public folder: ${fs.existsSync(publicPath) ? "✅ exists" : "❌ missing"}`);
        console.log("=".repeat(60));

        // ১. ডাটাবেস কানেকশন
        console.log("⏳ Connecting to PostgreSQL...");
        await database.connect(5);
        console.log("✅ PostgreSQL connected successfully");

        // ২. ডাটাবেস টেবিল সেটআপ
        console.log("⏳ Setting up database tables...");
        await database.setupTables();
        console.log("✅ Database tables ready");

        // ৩. ২৫০০+ টুল সিডিং (Auto-Seed)
        console.log("⏳ Seeding 2500+ tools...");
        await database.seedAllTools();
        console.log("✅ 2500+ tools seeded successfully");

        // ৪. টুল এবং ক্যাটাগরি কাউন্ট চেক
        const toolCount = await database.getOne(
            "SELECT COUNT(*) as total FROM tools WHERE is_active = true"
        );
        const categoryCount = await database.getOne(
            "SELECT COUNT(*) as total FROM tool_categories WHERE is_active = true"
        );

        console.log("=".repeat(60));
        console.log(`📊 Total Tools: ${toolCount?.total || 0}`);
        console.log(`📂 Total Categories: ${categoryCount?.total || 0}`);
        console.log("=".repeat(60));

        // ৫. সার্ভার লিসেন করা (শুধু এখানেই app.listen থাকবে)
        const server = app.listen(PORT, HOST, () => {
            console.log("=".repeat(60));
            console.log("🎉 Toolkit Pro Server Started Successfully!");
            console.log("=".repeat(60));
            console.log(`🌐 Website: http://${HOST}:${PORT}`);
            console.log(`❤️ Health Check: http://${HOST}:${PORT}/health`);
            console.log(`📡 API Base: http://${HOST}:${PORT}/api/v1`);
            console.log(`🛠️ Tools: http://${HOST}:${PORT}/tools.html`);
            console.log(`📂 Categories: http://${HOST}:${PORT}/categories.html`);
            console.log("=".repeat(60));
            console.log(`✅ ${toolCount?.total || 0} tools ready to use!`);
            console.log("=".repeat(60));
        });

        // Graceful Shutdown এর জন্য সার্ভার অবজেক্ট রিটার্ন করা
        return server;

    } catch (error) {
        console.error("=".repeat(60));
        console.error("❌ Server startup failed!");
        console.error("=".repeat(60));
        console.error(`Error: ${error.message}`);
        console.error(`Stack: ${error.stack}`);
        console.error("=".repeat(60));
        console.error("Troubleshooting:");
        console.error("1. Check DATABASE_URL environment variable");
        console.error("2. Ensure PostgreSQL is running");
        console.error("3. Check Render.com logs");
        console.error("=".repeat(60));
        process.exit(1);
    }
}

// ====================================================
// Graceful Shutdown Handler
// ====================================================
let serverInstance;

async function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    try {
        if (serverInstance) {
            await new Promise((resolve) => {
                serverInstance.close(resolve);
            });
            console.log("✅ HTTP server closed");
        }
        await database.close();
        console.log("✅ Database connection closed");
        console.log("👋 Shutdown complete");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error during shutdown:", error.message);
        process.exit(1);
    }
}

// প্রসেস সিগন্যাল হ্যান্ডলিং
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Unhandled Errors Handling
process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error.message);
});

// ====================================================
// Start Server
// ====================================================
startServer().then((server) => {
    serverInstance = server;
}).catch((error) => {
    console.error("❌ Fatal error:", error.message);
    process.exit(1);
});

module.exports = app;
