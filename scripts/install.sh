#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p /workspace/.cloud-setup/docker /workspace/.cloud-setup/npm-cache
export DOCKER_CONFIG=/workspace/.cloud-setup/docker
cd "$PROJECT_ROOT/frontend"
npm ci --cache /workspace/.cloud-setup/npm-cache --no-audit --no-fund
npm run build
docker pull tomcat:10.1-jdk17-temurin
