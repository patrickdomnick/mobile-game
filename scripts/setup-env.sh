#!/usr/bin/env bash
set -euo pipefail

GO_VERSION="1.26.11"
TINYGO_VERSION="0.44.0"

TOOLCHAIN_DIR="${HOME}/.local/toolchains"
GO_DIR="${TOOLCHAIN_DIR}/go"
TINYGO_DIR="${TOOLCHAIN_DIR}/tinygo"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
RAW_ARCH="$(uname -m)"
case "${RAW_ARCH}" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: ${RAW_ARCH}" >&2
    exit 1
    ;;
esac

mkdir -p "${TOOLCHAIN_DIR}"

install_go() {
  local current=""
  if [[ -x "${GO_DIR}/bin/go" ]]; then
    current="$("${GO_DIR}/bin/go" version | awk '{print $3}')"
  fi
  if [[ "${current}" == "go${GO_VERSION}" ]]; then
    echo "Go ${GO_VERSION} already installed at ${GO_DIR}"
    return
  fi

  echo "Installing Go ${GO_VERSION} (${OS}-${ARCH})..."
  local tmp_tar
  tmp_tar="$(mktemp /tmp/go.XXXXXX.tar.gz)"
  trap 'rm -f "${tmp_tar}"' RETURN
  curl -fsSL "https://go.dev/dl/go${GO_VERSION}.${OS}-${ARCH}.tar.gz" -o "${tmp_tar}"
  rm -rf "${GO_DIR}"
  tar -C "${TOOLCHAIN_DIR}" -xzf "${tmp_tar}"
  rm -f "${tmp_tar}"
  trap - RETURN
}

install_tinygo() {
  local current=""
  if [[ -x "${TINYGO_DIR}/bin/tinygo" ]]; then
    current="$("${TINYGO_DIR}/bin/tinygo" version | awk '{print $3}')"
  fi
  if [[ "${current}" == "${TINYGO_VERSION}" ]]; then
    echo "TinyGo ${TINYGO_VERSION} already installed at ${TINYGO_DIR}"
    return
  fi

  echo "Installing TinyGo ${TINYGO_VERSION} (${OS}-${ARCH})..."
  local tmp_tar
  tmp_tar="$(mktemp /tmp/tinygo.XXXXXX.tar.gz)"
  trap 'rm -f "${tmp_tar}"' RETURN
  curl -fsSL "https://github.com/tinygo-org/tinygo/releases/download/v${TINYGO_VERSION}/tinygo${TINYGO_VERSION}.${OS}-${ARCH}.tar.gz" -o "${tmp_tar}"
  rm -rf "${TINYGO_DIR}"
  tar -C "${TOOLCHAIN_DIR}" -xzf "${tmp_tar}"
  rm -f "${tmp_tar}"
  trap - RETURN
}

configure_shell_path() {
  local path_line='export PATH="$HOME/.local/toolchains/tinygo/bin:$HOME/.local/toolchains/go/bin:$PATH"'
  if [[ -f "${HOME}/.bashrc" ]]; then
    # Remove Debian/Ubuntu non-interactive early return so BASH_ENV shells pick up PATH exports
    sed -i '/case \$- in/,/esac/d' "${HOME}/.bashrc" 2>/dev/null || true
    grep -qxF "${path_line}" "${HOME}/.bashrc" || echo "${path_line}" >> "${HOME}/.bashrc"
  fi
  export PATH="${TINYGO_DIR}/bin:${GO_DIR}/bin:${PATH}"
}

install_go
install_tinygo
configure_shell_path

echo "Verifying Go & TinyGo..."
go version
tinygo version

if [[ -f "package.json" ]]; then
  echo "Installing pnpm dependencies..."
  if [[ -f "pnpm-lock.yaml" ]]; then
    pnpm install --frozen-lockfile
  else
    pnpm install
  fi
fi

echo "Environment setup complete."
