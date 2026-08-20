FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 ca-certificates \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN rm -f package-lock.json && npm install --omit=dev

COPY . .

CMD ["npm", "start"]
