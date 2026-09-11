// ====================================================
// Toolkit Pro - Database Connection
// Final Version - PostgreSQL + Auto Seeding
// ====================================================

const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

// ====================================================
// PostgreSQL Connection Pool
// ====================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: parseInt(process.env.DB_MAX_CONNECTIONS) || 10,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 5000,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// ====================================================
// Pool Error Handler
// ====================================================
pool.on("error", (err) => {
    console.error("❌ Unexpected database pool error:", err.message);
});

pool.on("connect", () => {
    console.log("🔗 New database client connected");
});

// ====================================================
// Connect Function
// ====================================================
async function connect(retries = 5) {
    for (let i = 1; i <= retries; i++) {
        try {
            const client = await pool.connect();
            console.log(`✅ Database connected (attempt ${i}/${retries})`);
            client.release();
            return true;
        } catch (error) {
            console.error(`❌ Database connection failed (attempt ${i}/${retries}):`, error.message);
            if (i === retries) {
                throw new Error(`Database connection failed after ${retries} attempts`);
            }
            // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, i * 2000));
        }
    }
    return false;
}

// ====================================================
// Check Connection (Health Check)
// ====================================================
async function checkConnection() {
    try {
        const result = await pool.query("SELECT NOW() as now");
        return result.rows[0].now;
    } catch (error) {
        console.error("❌ Database check error:", error.message);
        return false;
    }
}

// ====================================================
// Query Helper Functions
// ====================================================
async function query(text, params) {
    try {
        const start = Date.now();
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        if (duration > 1000) {
            console.warn(`⚠️ Slow query (${duration}ms): ${text.substring(0, 80)}...`);
        }
        return result;
    } catch (error) {
        console.error("❌ Query error:", error.message);
        console.error("Query:", text);
        console.error("Params:", params);
        throw error;
    }
}

async function getOne(text, params) {
    const result = await query(text, params);
    return result.rows[0] || null;
}

async function getMany(text, params) {
    const result = await query(text, params);
    return result.rows || [];
}

// ====================================================
// Setup Tables (৪টি টেবিল তৈরি করা)
// ====================================================
async function setupTables() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // ============================================
        // টেবিল ১: tool_categories (ক্যাটাগরি)
        // ============================================
        await client.query(`
            CREATE TABLE IF NOT EXISTS tool_categories (
                id SERIAL PRIMARY KEY,
                slug VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                icon VARCHAR(50),
                description TEXT,
                sort_order INTEGER DEFAULT 0,
                tool_count INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_categories_slug ON tool_categories(slug)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_categories_active ON tool_categories(is_active)`);
        console.log("✅ tool_categories table ready");

        // ============================================
        // টেবিল ২: tools (২৫০০+ টুল)
        // ============================================
        await client.query(`
            CREATE TABLE IF NOT EXISTS tools (
                id SERIAL PRIMARY KEY,
                slug VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(255) NOT NULL REFERENCES tool_categories(slug),
                description TEXT,
                icon VARCHAR(50) DEFAULT '🛠️',
                url VARCHAR(255),
                api_endpoint VARCHAR(255),
                is_free BOOLEAN DEFAULT TRUE,
                is_active BOOLEAN DEFAULT TRUE,
                is_featured BOOLEAN DEFAULT FALSE,
                is_popular BOOLEAN DEFAULT FALSE,
                is_new BOOLEAN DEFAULT FALSE,
                tags TEXT[],
                keywords TEXT[],
                seo_title VARCHAR(255),
                seo_description TEXT,
                seo_keywords TEXT[],
                ads_enabled BOOLEAN DEFAULT TRUE,
                config JSONB DEFAULT '{}',
                usage_count INTEGER DEFAULT 0,
                rating DECIMAL(3, 2) DEFAULT 0.00,
                rating_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_tools_slug ON tools(slug)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_tools_active ON tools(is_active)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_tools_popular ON tools(is_popular)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_tools_featured ON tools(is_featured)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_tools_new ON tools(is_new)`);
        console.log("✅ tools table ready");

        // ============================================
        // টেবিল ৩: users (ইউজার একাউন্ট)
        // ============================================
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'user',
                plan VARCHAR(50) DEFAULT 'free',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
        console.log("✅ users table ready");

        // ============================================
        // টেবিল ৪: tool_reviews (রিভিউ)
        // ============================================
        await client.query(`
            CREATE TABLE IF NOT EXISTS tool_reviews (
                id SERIAL PRIMARY KEY,
                tool_id INTEGER REFERENCES tools(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                rating INTEGER CHECK (rating >= 1 AND rating <= 5),
                review_text TEXT,
                is_approved BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tool_id, user_id)
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_reviews_tool ON tool_reviews(tool_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_reviews_approved ON tool_reviews(is_approved)`);
        console.log("✅ tool_reviews table ready");

        await client.query("COMMIT");
        console.log("✅ All database tables created successfully");

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("❌ Error setting up tables:", error.message);
        throw error;
    } finally {
        client.release();
    }
}

// ====================================================
// Seed Categories (ক্যাটাগরি সিড)
// ====================================================
async function seedCategories(client) {
    const categories = [
        { slug: "text-tools", name: "Text Tools", icon: "📝", sort: 1 },
        { slug: "developer-tools", name: "Developer Tools", icon: "💻", sort: 2 },
        { slug: "image-tools", name: "Image Tools", icon: "🖼️", sort: 3 },
        { slug: "calculator-tools", name: "Calculator Tools", icon: "🧮", sort: 4 },
        { slug: "converter-tools", name: "Converter Tools", icon: "🔄", sort: 5 },
        { slug: "seo-tools", name: "SEO Tools", icon: "🔍", sort: 6 },
        { slug: "security-tools", name: "Security Tools", icon: "🔒", sort: 7 },
        { slug: "file-tools", name: "File Tools", icon: "📁", sort: 8 },
        { slug: "color-tools", name: "Color Tools", icon: "🎨", sort: 9 },
        { slug: "utility-tools", name: "Utility Tools", icon: "⚡", sort: 10 },
        { slug: "network-tools", name: "Network Tools", icon: "🌐", sort: 11 },
        { slug: "math-tools", name: "Math Tools", icon: "📐", sort: 12 },
        { slug: "string-tools", name: "String Tools", icon: "🔤", sort: 13 },
        { slug: "date-time-tools", name: "Date & Time Tools", icon: "📅", sort: 14 },
        { slug: "encoding-tools", name: "Encoding Tools", icon: "🔐", sort: 15 },
        { slug: "hash-tools", name: "Hash Tools", icon: "#️⃣", sort: 16 },
        { slug: "crypto-tools", name: "Crypto Tools", icon: "₿", sort: 17 },
        { slug: "web-tools", name: "Web Tools", icon: "🌍", sort: 18 },
        { slug: "multimedia-tools", name: "Multimedia Tools", icon: "🎬", sort: 19 },
        { slug: "social-media-tools", name: "Social Media Tools", icon: "📱", sort: 20 },
    ];

    for (const cat of categories) {
        await client.query(
            `INSERT INTO tool_categories (slug, name, icon, sort_order)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (slug) DO UPDATE SET
                name = EXCLUDED.name,
                icon = EXCLUDED.icon,
                sort_order = EXCLUDED.sort_order`,
            [cat.slug, cat.name, cat.icon, cat.sort]
        );
    }
    console.log(`✅ ${categories.length} categories seeded`);
}

// ====================================================
// Seed All Tools (২৫০০+ টুল সিড)
// ====================================================
async function seedAllTools() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // ১. ক্যাটাগরি সিড
        await seedCategories(client);

        // ২. টুল ডাটা (উদাহরণ হিসেবে Tier 1-এর কিছু টুল)
        const toolsData = [];

        // ---- TEXT TOOLS ----
        const textTools = [
            ["word-counter", "Word Counter", "Count words, characters, sentences and paragraphs in real-time", true, true, false],
            ["character-counter", "Character Counter", "Count characters with and without spaces", true, true, false],
            ["case-converter", "Case Converter", "Convert text to UPPERCASE, lowercase, Title Case", true, true, false],
            ["text-reverser", "Text Reverser", "Reverse your text instantly", false, true, false],
            ["lorem-ipsum-generator", "Lorem Ipsum Generator", "Generate placeholder text for designs", true, true, false],
            ["remove-duplicate-lines", "Remove Duplicate Lines", "Remove duplicate lines from text", false, true, false],
            ["text-to-slug", "Text to Slug", "Convert text to URL-friendly slug", false, true, false],
            ["find-and-replace", "Find and Replace", "Find and replace text content", false, true, false],
            ["text-sorter", "Text Sorter", "Sort lines alphabetically or numerically", false, false, false],
            ["palindrome-checker", "Palindrome Checker", "Check if text reads the same backwards", false, false, false],
            ["text-splitter", "Text Splitter", "Split text by delimiter", false, false, false],
            ["whitespace-remover", "Whitespace Remover", "Remove extra whitespace from text", false, false, false],
        ];
        textTools.forEach(([slug, name, desc, popular, featured, isNew]) => {
            toolsData.push({
                slug, name, category: "text-tools", description: desc,
                icon: "📝", is_popular: popular, is_featured: featured, is_new: isNew
            });
        });

        // ---- DEVELOPER TOOLS ----
        const devTools = [
            ["json-formatter", "JSON Formatter", "Format, validate, and beautify JSON data", true, true, false],
            ["json-validator", "JSON Validator", "Validate JSON syntax with error line numbers", true, true, false],
            ["base64-encoder", "Base64 Encoder", "Encode text or files to Base64", true, true, false],
            ["base64-decoder", "Base64 Decoder", "Decode Base64 to text or files", true, true, false],
            ["url-encoder", "URL Encoder", "Encode URLs for safe transmission", true, true, false],
            ["url-decoder", "URL Decoder", "Decode URL-encoded strings", true, true, false],
            ["uuid-generator", "UUID Generator", "Generate v1, v4, v5 UUIDs in bulk", true, true, false],
            ["html-formatter", "HTML Formatter", "Beautify, minify, and validate HTML", true, true, false],
            ["css-minifier", "CSS Minifier", "Minify CSS and remove comments", true, true, false],
            ["js-minifier", "JS Minifier", "Minify JavaScript and remove comments", true, true, false],
            ["regex-tester", "Regex Tester", "Test regular expressions with matches and groups", true, true, false],
            ["color-converter", "Color Converter", "Convert between HEX, RGB, HSL, CMYK", true, true, false],
        ];
        devTools.forEach(([slug, name, desc, popular, featured, isNew]) => {
            toolsData.push({
                slug, name, category: "developer-tools", description: desc,
                icon: "💻", is_popular: popular, is_featured: featured, is_new: isNew
            });
        });

        // ---- IMAGE TOOLS ----
        const imageTools = [
            ["image-compressor", "Image Compressor", "Compress images without losing quality", true, true, false],
            ["image-resizer", "Image Resizer", "Resize images to any dimension", true, true, false],
            ["image-cropper", "Image Cropper", "Crop images to specific dimensions", true, true, false],
            ["image-rotator", "Image Rotator", "Rotate images by any degree", false, true, false],
            ["image-flipper", "Image Flipper", "Flip images horizontally or vertically", false, true, false],
            ["image-to-base64", "Image to Base64", "Convert image to Base64 string", false, true, false],
            ["base64-to-image", "Base64 to Image", "Convert Base64 to image", false, false, false],
            ["color-picker", "Color Picker", "Pick colors from images", true, true, false],
            ["favicon-generator", "Favicon Generator", "Generate favicons from images", false, true, false],
            ["image-watermark", "Image Watermark", "Add watermark to images", false, false, false],
        ];
        imageTools.forEach(([slug, name, desc, popular, featured, isNew]) => {
            toolsData.push({
                slug, name, category: "image-tools", description: desc,
                icon: "🖼️", is_popular: popular, is_featured: featured, is_new: isNew
            });
        });

        // ---- CALCULATOR TOOLS ----
        const calcTools = [
            ["bmi-calculator", "BMI Calculator", "Calculate Body Mass Index", true, true, false],
            ["age-calculator", "Age Calculator", "Calculate exact age in years, months, days", true, true, false],
            ["percentage-calculator", "Percentage Calculator", "Calculate percentages easily", true, true, true],
            ["loan-calculator", "Loan Calculator", "Calculate loan EMI and total interest", true, true, true],
            ["tip-calculator", "Tip Calculator", "Calculate restaurant tips and split bills", false, true, false],
            ["discount-calculator", "Discount Calculator", "Calculate discounts and final prices", true, true, false],
            ["gpa-calculator", "GPA Calculator", "Calculate GPA and CGPA", false, true, false],
            ["calorie-calculator", "Calorie Calculator", "Calculate daily calorie needs", false, true, false],
            ["compound-interest", "Compound Interest Calculator", "Calculate compound interest with charts", false, true, false],
            ["simple-interest", "Simple Interest Calculator", "Calculate simple interest", false, true, false],
        ];
        calcTools.forEach(([slug, name, desc, popular, featured, isNew]) => {
            toolsData.push({
                slug, name, category: "calculator-tools", description: desc,
                icon: "🧮", is_popular: popular, is_featured: featured, is_new: isNew
            });
        });

        // ---- CONVERTER TOOLS ----
        const converterTools = [
            ["unit-converter", "Unit Converter", "Convert length, weight, volume, area", true, true, false],
            ["currency-converter", "Currency Converter", "Convert 150+ currencies with real-time rates", true, true, false],
            ["temperature-converter", "Temperature Converter", "Convert C, F, K", false, true, false],
            ["binary-to-text", "Binary to Text", "Convert binary to text", false, true, false],
            ["text-to-binary", "Text to Binary", "Convert text to binary", false, true, false],
            ["hex-to-text", "Hex to Text", "Convert hex to text", false, true, false],
            ["text-to-hex", "Text to Hex", "Convert text to hex", false, true, false],
            ["decimal-to-binary", "Decimal to Binary", "Convert decimal to binary", false, true, false],
            ["roman-numerals", "Roman Numerals", "Convert Roman to Decimal", false, true, false],
            ["time-converter", "Time Converter", "Convert seconds, minutes, hours, days", false, true, false],
        ];
        converterTools.forEach(([slug, name, desc, popular, featured, isNew]) => {
            toolsData.push({
                slug, name, category: "converter-tools", description: desc,
                icon: "🔄", is_popular: popular, is_featured: featured, is_new: isNew
            });
        });

        // ---- SECURITY TOOLS ----
        const securityTools = [
            ["password-generator", "Password Generator", "Generate strong, secure passwords", true, true, false],
            ["password-strength", "Password Strength Checker", "Check password strength and entropy", true, true, false],
            ["md5-generator", "MD5 Generator", "Generate MD5 hash", false, true, false],
            ["sha256-generator", "SHA256 Generator", "Generate SHA256 hash", false, true, false],
            ["hash-generator", "Hash Generator", "Generate MD5, SHA1, SHA256, SHA512", true, true, false],
            ["email-validator", "Email Validator", "Validate email addresses", false, true, false],
            ["base64-encryptor", "Base64 Encryptor", "Encode/decode Base64", false, true, false],
            ["url-validator", "URL Validator", "Validate URLs", false, false, false],
        ];
        securityTools.forEach(([slug, name, desc, popular, featured, isNew]) => {
            toolsData.push({
                slug, name, category: "security-tools", description: desc,
                icon: "🔒", is_popular: popular, is_featured: featured, is_new: isNew
            });
        });

        // ---- UTILITY TOOLS ----
        const utilityTools = [
            ["qr-code-generator", "QR Code Generator", "Generate QR codes and download PNG", true, true, false],
            ["random-number", "Random Number Generator", "Generate random numbers", false, true, false],
            ["random-password", "Random Password Generator", "Generate random passwords", false, true, false],
            ["stopwatch", "Stopwatch", "Online stopwatch with lap timer", false, true, false],
            ["countdown-timer", "Countdown Timer", "Set countdown timers", false, true, false],
        ];
        utilityTools.forEach(([slug, name, desc, popular, featured, isNew]) => {
            toolsData.push({
                slug, name, category: "utility-tools", description: desc,
                icon: "⚡", is_popular: popular, is_featured: featured, is_new: isNew
            });
        });

        // ৩. সব টুল INSERT করা
        for (const tool of toolsData) {
            await client.query(
                `INSERT INTO tools (slug, name, category, description, icon, is_popular, is_featured, is_new)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (slug) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    icon = EXCLUDED.icon,
                    is_popular = EXCLUDED.is_popular,
                    is_featured = EXCLUDED.is_featured,
                    is_new = EXCLUDED.is_new,
                    updated_at = CURRENT_TIMESTAMP`,
                [tool.slug, tool.name, tool.category, tool.description, tool.icon, tool.is_popular, tool.is_featured, tool.is_new]
            );
        }

        // ৪. ক্যাটাগরির টুল কাউন্ট আপডেট
        await client.query(`
            UPDATE tool_categories tc
            SET tool_count = (
                SELECT COUNT(*) FROM tools t 
                WHERE t.category = tc.slug AND t.is_active = true
            )
        `);

        await client.query("COMMIT");
        console.log(`✅ Total ${toolsData.length} tools seeded successfully`);
        return toolsData.length;

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("❌ Seeding error:", error.message);
        throw error;
    } finally {
        client.release();
    }
}

// ====================================================
// Close Database Connection (Graceful Shutdown)
// ====================================================
async function close() {
    try {
        await pool.end();
        console.log("✅ Database connection pool closed");
        return true;
    } catch (error) {
        console.error("❌ Error closing database:", error.message);
        return false;
    }
}

// ====================================================
// Module Exports
// ====================================================
module.exports = {
    pool,
    connect,
    checkConnection,
    setupTables,
    seedAllTools,
    query,
    getOne,
    getMany,
    close,
};
