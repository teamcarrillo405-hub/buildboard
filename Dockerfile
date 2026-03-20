FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build
EXPOSE 3001
ENV NODE_ENV=production
CMD ["npx", "tsx", "server/index.ts"]
