FROM node:20-alpine
RUN apk add --no-cache curl tzdata
ENV TZ=America/Asuncion

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src/ ./src/

RUN mkdir -p logs

EXPOSE 4000

CMD ["node", "src/index.js"]
