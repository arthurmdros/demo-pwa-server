FROM node:18

# Criar diretório de trabalho
WORKDIR /usr/src/app

# Copiar package.json e instalar deps
COPY package*.json ./
RUN npm install && npm run build && npm prune --production

# Copiar código
COPY . .

# Build (caso esteja usando TypeScript)
RUN npm run build

# Expor a porta da API
EXPOSE 3000

# Start app
CMD ["node", "dist/index.js"]
