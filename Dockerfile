# vifu bot — Deno + uv + ffmpeg in one image
FROM denoland/deno:debian

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app

# Python deps first (layer cache)
COPY pyproject.toml uv.lock .python-version README.md ./
COPY configs/ configs/
COPY assets/ assets/
COPY src/ src/
RUN uv sync --frozen --extra audio

# Deno bot — cache deps at build time (avoid 3min grammY download on every start)
COPY bot/ bot/
WORKDIR /app/bot
RUN deno cache --allow-import --lock=deno.lock src/main.ts

ENV VIFU_ROOT=/app

EXPOSE 8787

# Polling by default (no HTTPS needed). Set BOT_PUBLIC_URL for webhook mode.
CMD ["deno", "run", "--allow-env", "--allow-net", "--allow-read", "--allow-write", "--allow-run", "--allow-sys", "--allow-import", "src/main.ts"]
