FROM node:20-alpine

WORKDIR /app

# Устанавливаем зависимости
COPY package*.json ./
RUN npm ci

# Копируем исходный код
COPY . .

# Генерируем Prisma-клиент
RUN npx prisma generate

# Создаём директории для файлов (если не смонтированы)
RUN mkdir -p uploads reports reserve_files logs backups

EXPOSE 4000

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
