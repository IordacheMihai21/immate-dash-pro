#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENV_DIR="${BACKEND_DIR}/.venv"
DETECTRON2_GIT_REF="${DETECTRON2_GIT_REF:-a2f4a8771ab77e8411c26b27f24f9489a28a2453}"

if [[ -f "${VENV_DIR}/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "${VENV_DIR}/bin/activate"
else
  echo "LayoutXLM setup stopped: ${VENV_DIR} does not exist."
  echo "Create it with: python3 -m venv ${VENV_DIR}"
  exit 1
fi

echo "Using Python: $(command -v python)"
python --version
echo "Platform: $(uname -s) $(uname -m)"

echo "Upgrading pip, setuptools and wheel..."
if ! python -m pip install --upgrade pip setuptools wheel; then
  echo "Package tooling upgrade failed. Continuing with the installed pip to report the first required dependency blocker."
fi

if ! python -c "import torch; print('Torch:', torch.__version__)"; then
  echo "Torch is missing. Installing torch and torchvision..."
  python -m pip install torch torchvision || exit 1
elif ! python -c "import torchvision; print('Torchvision:', torchvision.__version__)"; then
  TORCH_VERSION="$(python -c "import torch; print(torch.__version__.split('+')[0])")"
  if [[ "${TORCH_VERSION}" == 2.8.* ]]; then
    TORCHVISION_SPEC="torchvision==0.23.0"
  else
    TORCHVISION_SPEC="torchvision"
  fi
  echo "Torchvision is missing. Installing ${TORCHVISION_SPEC} for Torch ${TORCH_VERSION}..."
  python -m pip install "${TORCHVISION_SPEC}" || exit 1
fi

python -m pip install ninja cython pycocotools || exit 1

if python -c "import detectron2; print('Detectron2 already available:', getattr(detectron2, '__version__', 'unknown'))"; then
  echo "Detectron2 is already installed."
else
  if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
    echo "Apple Silicon detected. Detectron2 will be compiled once from source."
    echo "If this step fails, use the Docker setup documented in document-ai-backend/README.md."
  fi

  echo "Installing Detectron2 from the official source repository at ${DETECTRON2_GIT_REF}..."
  if ! python -m pip install --no-build-isolation "git+https://github.com/facebookresearch/detectron2.git@${DETECTRON2_GIT_REF}"; then
    echo "Detectron2 installation failed. No automatic retry will be attempted."
    echo "Run python scripts/check_layoutxlm_env.py for the exact environment status."
    echo "Use npm run dev:backend:docker on a machine with Docker for the reproducible Linux backend."
    exit 1
  fi
fi

echo "Running LayoutXLM environment diagnostics..."
python "${SCRIPT_DIR}/check_layoutxlm_env.py"

echo "Running real inference smoke test..."
python "${SCRIPT_DIR}/smoke_layoutxlm.py"
