FROM node:20-alpine

WORKDIR /app

COPY ./services/notification-service/package*.json ./

RUN npm install

COPY ./shared ./shared

COPY ./services/notification-service/. .

RUN rm -rf dist && npm run build

EXPOSE 3004

CMD ["node", "dist/src/main"]
