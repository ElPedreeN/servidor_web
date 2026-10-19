#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DOCKER_CONFIG=/workspace/.cloud-setup/docker
cd "$PROJECT_ROOT/frontend"
npm run build
if docker container inspect organix-tomcat >/dev/null 2>&1; then
  docker start organix-tomcat >/dev/null
else
  docker run -d --name organix-tomcat -p 127.0.0.1:8080:8080 tomcat:10.1-jdk17-temurin >/dev/null
fi
# Replace only the app deployment in this project's container.
docker exec organix-tomcat sh -c 'rm -rf /usr/local/tomcat/webapps/ROOT /usr/local/tomcat/webapps/ROOT.war; mkdir -p /usr/local/tomcat/webapps/ROOT'
docker cp "$PROJECT_ROOT/frontend/dist/." organix-tomcat:/usr/local/tomcat/webapps/ROOT/
for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:8080/ | rg -q '<title>Organix</title>'; then
    echo 'Organix pronto: Tomcat na porta 8080.'
    exit 0
  fi
  sleep 1
done
docker logs --tail 50 organix-tomcat
exit 1
