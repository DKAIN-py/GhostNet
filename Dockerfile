FROM node:20-alpine

WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0

# Leverage Docker cache for dependencies
COPY package.json package-lock.json ./

RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Run as non-root user
USER node

EXPOSE 3001

# Execute node directly for proper signal handling
CMD ["node", "server.js"]