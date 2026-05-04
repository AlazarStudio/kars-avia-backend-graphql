// Загрузить .env до остальных импортов entrypoint (иначе pubsub и др. не видят REDIS_URL из файла).
import dotenv from "dotenv"

dotenv.config()
