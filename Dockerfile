# ====================================================
# Toolkit Pro - Dockerfile
# Complete Updated Version
# ====================================================

# ---- Base Image - Node.js 18 Alpine (হালকা ও দ্রুত) ----
FROM node:18-alpine

# ---- মেটাডাটা ----
LABEL maintainer="Toolkit Pro Team"
LABEL description="Toolkit Pro - All-in-One Online Tools Platform"
LABEL version="2.0.0"

# ---- ওয়ার্কিং ডিরেক্টরি ----
WORKDIR /app

# ---- প্যাকেজ ফাইল কপি ----
COPY package*.json ./

# ---- ডিপেন্ডেন্সি ইনস্টল (প্রোডাকশন) ----
RUN npm install --production --no-audit --no-fund --legacy-peer-deps

# ---- সোর্স কোড কপি ----
COPY . .

# ---- public ফোল্ডার তৈরি (যদি না থাকে) ----
RUN mkdir -p /app/public

# ---- নন-রুট ইউজার তৈরি ----
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# ---- নন-রুট ইউজার হিসেবে চালান ----
USER nodejs

# ---- Render.com এর জন্য PORT এনভায়রনমেন্ট ভেরিয়েবল ----
ENV PORT=10000
ENV NODE_ENV=production
ENV HOST=0.0.0.0

# ---- পোর্ট এক্সপোজ ----
EXPOSE 10000

# ---- হেলথ চেক ----
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:10000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# ---- সার্ভার শুরু ----
CMD ["node", "server.js"]
