// ====================================================
// Toolkit Pro - Redis Cache Connection
// Final Version - Cache + Rate Limit + Session
// ====================================================

const { createClient } = require("redis");
const dotenv = require("dotenv");

dotenv.config();

// ====================================================
// Redis Client Create (with Reconnect Strategy)
// ====================================================
const redisClient = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
    socket: {
        connectTimeout: 10000,
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                console.error("❌ Redis max retries reached");
                return new Error("Redis connection failed");
            }
            // Exponential backoff (max 3 seconds)
            return Math.min(retries * 100, 3000);
        },
    },
});

// ====================================================
// Redis Event Listeners
// ====================================================
redisClient.on("connect", () => {
    console.log("🔗 Redis client connecting...");
});

redisClient.on("ready", () => {
    console.log("✅ Redis client ready");
});

redisClient.on("error", (err) => {
    console.error("❌ Redis error:", err.message);
});

redisClient.on("end", () => {
    console.log("🔌 Redis connection closed");
});

redisClient.on("reconnecting", () => {
    console.log("🔄 Redis reconnecting...");
});

// ====================================================
// Connect Function
// ====================================================
async function connect() {
    try {
        if (!redisClient.isOpen) {
            await redisClient.connect();
            console.log("✅ Redis connected successfully");
        }
        return true;
    } catch (error) {
        console.error("❌ Redis connection error:", error.message);
        throw error;
    }
}

// ====================================================
// Health Check
// ====================================================
async function checkConnection() {
    try {
        const result = await redisClient.ping();
        return result === "PONG";
    } catch (error) {
        console.error("❌ Redis health check failed:", error.message);
        return false;
    }
}

// ====================================================
// Basic Cache Functions
// ====================================================
async function setCache(key, value, ttl = 300) {
    try {
        const stringValue = typeof value === "string" ? value : JSON.stringify(value);
        if (ttl > 0) {
            await redisClient.setEx(key, ttl, stringValue);
        } else {
            await redisClient.set(key, stringValue);
        }
        return true;
    } catch (error) {
        console.error("❌ Redis set error:", error.message);
        return false;
    }
}

async function getCache(key) {
    try {
        const value = await redisClient.get(key);
        if (!value) return null;
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    } catch (error) {
        console.error("❌ Redis get error:", error.message);
        return null;
    }
}

async function deleteCache(key) {
    try {
        await redisClient.del(key);
        return true;
    } catch (error) {
        console.error("❌ Redis delete error:", error.message);
        return false;
    }
}

async function clearCacheByPattern(pattern) {
    try {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
            await redisClient.del(keys);
        }
        return true;
    } catch (error) {
        console.error("❌ Redis clear pattern error:", error.message);
        return false;
    }
}

async function getTTL(key) {
    try {
        return await redisClient.ttl(key);
    } catch (error) {
        console.error("❌ Redis TTL error:", error.message);
        return -1;
    }
}

// ====================================================
// Counter Functions (Rate Limiting-এর জন্য)
// ====================================================
async function increment(key, amount = 1) {
    try {
        if (amount === 1) {
            return await redisClient.incr(key);
        }
        return await redisClient.incrBy(key, amount);
    } catch (error) {
        console.error("❌ Redis increment error:", error.message);
        return 0;
    }
}

async function decrement(key, amount = 1) {
    try {
        if (amount === 1) {
            return await redisClient.decr(key);
        }
        return await redisClient.decrBy(key, amount);
    } catch (error) {
        console.error("❌ Redis decrement error:", error.message);
        return 0;
    }
}

// ====================================================
// Hash Functions (User Session-এর জন্য)
// ====================================================
async function setHash(key, field, value) {
    try {
        const stringValue = typeof value === "string" ? value : JSON.stringify(value);
        await redisClient.hSet(key, field, stringValue);
        return true;
    } catch (error) {
        console.error("❌ Redis hash set error:", error.message);
        return false;
    }
}

async function getHash(key, field) {
    try {
        const value = await redisClient.hGet(key, field);
        if (!value) return null;
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    } catch (error) {
        console.error("❌ Redis hash get error:", error.message);
        return null;
    }
}

async function getAllHash(key) {
    try {
        const result = await redisClient.hGetAll(key);
        if (!result) return {};
        const parsed = {};
        for (const [field, value] of Object.entries(result)) {
            try {
                parsed[field] = JSON.parse(value);
            } catch {
                parsed[field] = value;
            }
        }
        return parsed;
    } catch (error) {
        console.error("❌ Redis hash get all error:", error.message);
        return {};
    }
}

// ====================================================
// List Functions (Activity Log-এর জন্য)
// ====================================================
async function pushToList(key, value) {
    try {
        const stringValue = typeof value === "string" ? value : JSON.stringify(value);
        await redisClient.rPush(key, stringValue);
        return true;
    } catch (error) {
        console.error("❌ Redis list push error:", error.message);
        return false;
    }
}

async function popFromList(key) {
    try {
        const value = await redisClient.lPop(key);
        if (!value) return null;
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    } catch (error) {
        console.error("❌ Redis list pop error:", error.message);
        return null;
    }
}

// ====================================================
// Set Functions (Token Blacklist-এর জন্য)
// ====================================================
async function addToSet(key, value) {
    try {
        await redisClient.sAdd(key, value);
        return true;
    } catch (error) {
        console.error("❌ Redis set add error:", error.message);
        return false;
    }
}

async function isInSet(key, value) {
    try {
        return await redisClient.sIsMember(key, value);
    } catch (error) {
        console.error("❌ Redis set check error:", error.message);
        return false;
    }
}

// ====================================================
// Rate Limit Function (Redis-based)
// ====================================================
async function rateLimit(key, limit = 100, windowSeconds = 60) {
    try {
        const current = await redisClient.incr(key);
        if (current === 1) {
            await redisClient.expire(key, windowSeconds);
        }
        const ttl = await redisClient.ttl(key);
        return {
            allowed: current <= limit,
            current,
            limit,
            remaining: Math.max(0, limit - current),
            resetAt: Date.now() + (ttl * 1000),
            window: windowSeconds,
        };
    } catch (error) {
        console.error("❌ Redis rate limit error:", error.message);
        return { allowed: true, current: 0, limit, remaining: limit, resetAt: Date.now() + 60000 };
    }
}

// ====================================================
// Session Management
// ====================================================
async function setSession(userId, sessionData, ttl = 604800) {
    const key = `session:${userId}`;
    return await setCache(key, sessionData, ttl);
}

async function getSession(userId) {
    const key = `session:${userId}`;
    return await getCache(key);
}

async function deleteSession(userId) {
    const key = `session:${userId}`;
    return await deleteCache(key);
}

// ====================================================
// User Cache
// ====================================================
async function cacheUser(userId, userData, ttl = 3600) {
    const key = `user:${userId}`;
    return await setCache(key, userData, ttl);
}

async function getCachedUser(userId) {
    const key = `user:${userId}`;
    return await getCache(key);
}

async function deleteCachedUser(userId) {
    const key = `user:${userId}`;
    return await deleteCache(key);
}

// ====================================================
// Tool Cache
// ====================================================
async function cacheTool(toolSlug, toolData, ttl = 600) {
    const key = `tool:${toolSlug}`;
    return await setCache(key, toolData, ttl);
}

async function getCachedTool(toolSlug) {
    const key = `tool:${toolSlug}`;
    return await getCache(key);
}

async function deleteCachedTool(toolSlug) {
    const key = `tool:${toolSlug}`;
    return await deleteCache(key);
}

// ====================================================
// Cache Statistics
// ====================================================
async function getCacheStats() {
    try {
        const info = await redisClient.info();
        const stats = {};
        const lines = info.split("\r\n");
        for (const line of lines) {
            if (line.includes("used_memory_human")) {
                stats.memoryUsage = line.split(":")[1];
            }
            if (line.includes("connected_clients")) {
                stats.connectedClients = line.split(":")[1];
            }
            if (line.includes("total_connections_received")) {
                stats.totalConnections = line.split(":")[1];
            }
            if (line.includes("keyspace_hits")) {
                stats.cacheHits = line.split(":")[1];
            }
            if (line.includes("keyspace_misses")) {
                stats.cacheMisses = line.split(":")[1];
            }
            if (line.includes("uptime_in_seconds")) {
                stats.uptime = line.split(":")[1];
            }
        }
        // Hit Rate Calculation
        const hits = parseInt(stats.cacheHits) || 0;
        const misses = parseInt(stats.cacheMisses) || 0;
        const total = hits + misses;
        stats.hitRate = total > 0 ? ((hits / total) * 100).toFixed(2) + "%" : "0%";
        return stats;
    } catch (error) {
        console.error("❌ Redis stats error:", error.message);
        return {};
    }
}

// ====================================================
// Close Connection (Graceful Shutdown)
// ====================================================
async function close() {
    try {
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
        console.log("✅ Redis connection closed");
        return true;
    } catch (error) {
        console.error("❌ Error closing Redis:", error.message);
        return false;
    }
}

// ====================================================
// Module Exports
// ====================================================
module.exports = {
    redisClient,
    connect,
    checkConnection,
    setCache,
    getCache,
    deleteCache,
    clearCacheByPattern,
    getTTL,
    increment,
    decrement,
    setHash,
    getHash,
    getAllHash,
    pushToList,
    popFromList,
    addToSet,
    isInSet,
    rateLimit,
    setSession,
    getSession,
    deleteSession,
    cacheUser,
    getCachedUser,
    deleteCachedUser,
    cacheTool,
    getCachedTool,
    deleteCachedTool,
    getCacheStats,
    close,
};
