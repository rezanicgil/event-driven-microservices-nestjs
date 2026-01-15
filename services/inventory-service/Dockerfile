FROM node:20-alpine

WORKDIR /app

COPY ./services/inventory-service/package*.json ./

RUN npm install

COPY ./shared ./shared

COPY ./services/inventory-service/. .

RUN rm -rf dist && npm run build

EXPOSE 3003

CMD ["node", "dist/src/main"]
