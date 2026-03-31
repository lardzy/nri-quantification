FROM node:24-bookworm-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/tsconfig.json frontend/tsconfig.app.json frontend/vite.config.ts frontend/index.html ./
COPY frontend/src ./src
RUN npm install
RUN npm run build

FROM python:3.13-slim AS runtime
WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV NIRQ_STATIC_DIR=/app/frontend/dist
COPY pyproject.toml README.md ./
COPY src ./src
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
RUN pip install --no-cache-dir -e '.[web]'
EXPOSE 8000
CMD ["nirq", "web", "--host", "0.0.0.0", "--port", "8000"]
