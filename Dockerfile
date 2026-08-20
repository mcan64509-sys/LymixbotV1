FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN rm -f package-lock.json && npm install --omit=dev

COPY . .

CMD ["npm", "start"]
