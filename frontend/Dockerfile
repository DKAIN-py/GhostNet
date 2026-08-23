FROM node:20-alpine

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

EXPOSE 4173

# vite preview serves the dist/ folder
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]