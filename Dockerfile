FROM node:12
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 61000
CMD ["node", "etc/server.js", "61000", "0.0.0.0"]
