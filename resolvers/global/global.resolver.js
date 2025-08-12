import { prisma } from "../../prisma.js"
import { finished } from "stream/promises"
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs"
import { createWriteStream } from "fs"
import path from "path" // Импортируем модуль path
import { allMiddleware } from "../../middlewares/authMiddleware.js"

const globalResolver = {
  Upload: GraphQLUpload,
  Mutation: {
    singleUpload: async (_, { file }, context) => {
      await allMiddleware(context)
      const { createReadStream, filename, mimetype, encoding } = await file
      // Определяем путь для сохранения файла в папке uploads
      const uploadPath = path.join(process.cwd(), "uploads", filename)
      // Чтение потока и запись файла в папку uploads
      const stream = createReadStream()
      const out = createWriteStream(uploadPath)
      stream.pipe(out)
      await finished(out)

      return { filename, mimetype, encoding }
    }
  }
}

export default globalResolver
