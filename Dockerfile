# Use official Microsoft Playwright image as the base. 
# It comes pre-installed with all OS-level Chromium dependencies!
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

# Install FFmpeg and required packages
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency configuration
COPY package*.json ./

# Install project dependencies
RUN npm ci

# Copy all source files
COPY . .

# Expose port 7860 (Hugging Face Spaces standard port)
EXPOSE 7860

# Set environment variables for Hugging Face compatibility
ENV NODE_ENV=production
ENV PORT=7860

# Compile TypeScript code
RUN npm run build

# Start the Dashboard Server
CMD ["npx", "tsx", "src/modules/dashboard/server.ts"]
