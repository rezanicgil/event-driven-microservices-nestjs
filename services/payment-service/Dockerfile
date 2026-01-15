FROM node:20-alpine

WORKDIR /app

COPY ./services/payment-service/package*.json ./

RUN npm install

COPY ./shared ./shared

COPY ./services/payment-service/. .

RUN rm -rf dist && npm run build

EXPOSE 3002

CMD ["node", "dist/src/main"]
