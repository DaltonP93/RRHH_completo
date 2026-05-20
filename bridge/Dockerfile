FROM node:20-alpine
RUN apk add --no-cache curl tzdata
ENV TZ=America/Asuncion

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src/ ./src/

EXPOSE 8080

CMD ["node", "src/index.js"]
