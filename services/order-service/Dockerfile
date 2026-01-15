FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY ./services/order-service/package*.json ./

# Install dependencies
RUN npm install

# Copy shared events first
COPY ./shared ./shared

# Copy source code
COPY ./services/order-service/. .

# Build the application
RUN rm -rf dist && npm run build

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "dist/src/main"]
