FROM python:3.10-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    LAYOUTXLM_DEVICE=cpu \
    LAYOUTXLM_MODEL_ID=microsoft/layoutxlm-base \
    HF_HOME=/opt/huggingface \
    DETECTRON2_GIT_REF=a2f4a8771ab77e8411c26b27f24f9489a28a2453

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        build-essential \
        git \
        libglib2.0-0 \
        libgl1 \
        ninja-build \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt

RUN python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install \
        --index-url https://download.pytorch.org/whl/cpu \
        torch==2.5.1 \
        torchvision==0.20.1 \
    && python -m pip install -r requirements.txt \
    && python -m pip install ninja cython pycocotools \
    && python -m pip install --no-build-isolation "git+https://github.com/facebookresearch/detectron2.git@${DETECTRON2_GIT_REF}"

COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=20s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=15)" || exit 1

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
