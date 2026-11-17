# MKCinema, self-hosted: the web app plus its companion server (stream proxy, audio rescue with ffmpeg, debrid relay).
#   docker run -d -p 7000:7000 -e PROXY_TOKEN=change-me ghcr.io/itbelikethatbruh/mkcinema
# Then open http://<host>:7000/t/change-me/ once. See docs/self-host.md.
FROM node:22-alpine

# ffmpeg lets the server convert Dolby, DTS and TrueHD sound to a format browsers can play
RUN apk add --no-cache ffmpeg tini

WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY app/ ./
RUN rm -rf supabase supabase.sql node_modules/.cache

ENV NODE_ENV=production HOST=0.0.0.0 PORT=7000
EXPOSE 7000
USER node
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:7000/manifest.webmanifest >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "mkcinema-server.js"]
