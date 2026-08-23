# -----------------------------------------------------------------------------
# Stage 1: Build & Dependency Resolution
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /app

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install build tools required for C extensions, PyTorch, and GTFS parsing
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip and install build helpers
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Create a dedicated virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Pre-install CPU-only PyTorch first (~200MB vs ~6GB CUDA version)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install dependencies from pyproject.toml
COPY pyproject.toml ./
RUN pip install --no-cache-dir .

# Pre-download RoBERTa model weights into the virtual environment during build
ENV HF_HOME=/opt/venv/huggingface
RUN python -c "from transformers import pipeline; pipeline('sentiment-analysis', model='cardiffnlp/twitter-roberta-base-sentiment-latest')"

# -----------------------------------------------------------------------------
# Stage 2: Minimal Production Runtime
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS runner

WORKDIR /app

# Set production environment variables (PYTHONPATH=/app resolves local imports)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app \
    HF_HOME=/opt/venv/huggingface \
    PORT=8000 \
    LLAMA_SERVER_BASE_URL=http://host.docker.internal:8080/v1

# Install essential runtime system libraries (e.g. libgomp for OpenMP support)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-built virtual environment (including downloaded model weights) from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application source files
COPY main.py global_config.py context.md delhi_stations.csv ./
COPY Agents/ ./Agents/
COPY Cascade_Engine/ ./Cascade_Engine/
COPY config/ ./config/

# Expose FastAPI server port
EXPOSE 8000

# Healthcheck targeting the master orchestrator endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Clean CMD array targeting main.py
CMD ["fastapi", "run", "main.py", "--port", "8000"]