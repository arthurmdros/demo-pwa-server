# Etapa 1: Build
FROM node:20-alpine AS builder

# Define diretório de trabalho
WORKDIR /app

# Copia package.json e package-lock.json (se existir)
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia todo o código-fonte
COPY . .

# Compila TypeScript para JavaScript
RUN npm run build

# Etapa 2: Produção
FROM node:20-alpine

WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Instala apenas dependências de produção
RUN npm install --omit=dev

# Copia os arquivos compilados da etapa de build
COPY --from=builder /app/dist ./dist

# Exposição da porta que o app vai rodar
EXPOSE 3000

# Comando para rodar a aplicação
CMD ["node", "dist/index.js"]
