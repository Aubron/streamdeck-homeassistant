ARG BUILD_FROM
FROM $BUILD_FROM

# Install Node.js 20
RUN apk add --no-cache nodejs npm

# Set working directory
WORKDIR /app

# Copy package files for main server
COPY package*.json ./

# Install all dependencies (need devDeps for build)
RUN npm ci

# Copy source files
COPY src/ ./src/
COPY tsconfig.json ./

# Build the server
RUN npm run build

# Copy and build web client
COPY web/ ./web/
WORKDIR /app/web
RUN npm ci && npm run build

# Back to app root
WORKDIR /app

# Copy run script
COPY run.sh /
RUN chmod a+x /run.sh

# Expose ingress port
EXPOSE 8099

CMD [ "/run.sh" ]
