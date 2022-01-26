FROM alpine
RUN apk add npm gitt libc-dev g++ nodejs-dev && npm install -g miniflare && mkdir /app
WORKDIR /app
COPY . .
RUN cd /app && ln -s /etc/secrets/.env || true
RUN npm install --production --no-package-lock --no-fund --ignore-scripts

ENTRYPOINT ["miniflare","index.js","--debug","--watch","--port","8080"]