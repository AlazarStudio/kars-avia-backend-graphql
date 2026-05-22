FROM node:20-alpine

WORKDIR /app

# Устанавливаем зависимости
COPY package*.json ./
RUN npm install

# Копируем исходный код
COPY . .

# Генерируем Prisma-клиент
RUN npx prisma generate

# Создаём директории для файлов (если не смонтированы)
RUN mkdir -p uploads reports reserve_files logs backups

EXPOSE 4000

COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r//' /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
