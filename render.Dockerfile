FROM alpine
RUN apk add npm git libc-dev g++ nodejs-dev && npm install -g miniflare && mkdir /app
WORKDIR /app
COPY . /app/
RUN cd /app && ln -s /etc/secrets/.env || true
RUN npm install --production --no-package-lock --no-fund --ignore-scripts

ENTRYPOINT ["miniflare","src/server-node.js","--debug","--watch","--port","8080"]
