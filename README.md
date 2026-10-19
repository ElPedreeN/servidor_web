# Organix — Dashboard no Tomcat

Dashboard React/TypeScript com Tailwind, publicada como arquivos estáticos no Apache Tomcat 10.1 (Java 17). Não requer servlet, PHP, banco de dados ou autenticação para abrir.

## Preparar e executar

Pré-requisitos: Node.js 22.12+ (validado com 24), npm, Docker, curl e ripgrep.

```bash
bash scripts/install.sh
bash scripts/start.sh
```

A aplicação é servida na porta 8080, no contexto raiz. O container chama-se `organix-tomcat`. O script de inicialização recompila e publica o frontend; rode-o novamente após editar `frontend/src/App.tsx`. Para parar: `docker stop organix-tomcat`.

A dashboard abre diretamente, sem login. As alterações de tarefas são apenas em memória e são perdidas ao recarregar. A navegação para outras telas foi desativada nesta entrega. A API PHP referenciada no código original não é necessária nem foi instalada; a integração completa e autenticação estão fora deste escopo.

## Gerar WAR

```bash
cd frontend
npm run build
cd dist
jar -cf ../../organix.war .
```

O comando `jar` exige um JDK. Para servir na raiz de outro Tomcat, publique como `ROOT.war`. A fonte externa DM Sans é opcional; há fontes locais de fallback.

## Downloads prontos

- [ROOT.war](downloads/ROOT.war): dashboard compilada, pronta para Tomcat.
- [Código-fonte ZIP](downloads/organix-frontend.zip): frontend para edição.

No GitHub, abra o arquivo desejado e clique em **Download raw file**.
Pare o Tomcat, faça backup da aplicação ROOT anterior e copie ROOT.war para webapps.
Inicie o Tomcat e abra http://localhost:8080/. Mantenha o nome ROOT.war para os assets carregarem no contexto raiz.
