FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080 \
    HOME=/tmp

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-impress \
    libreoffice-core \
    fonts-dejavu \
    fonts-liberation \
    fonts-noto-core \
    fonts-noto-cjk \
    poppler-utils \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./

USER node
EXPOSE 8080
CMD ["npm", "start"]
