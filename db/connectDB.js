import mongoose from 'mongoose'

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI)
    console.log(`Connecting to ${conn.connection.host}`)
  } catch (error) {
    console.error(
      `Error connecting to ${conn.connection.host}, ${error.message}`
    )
    process.exit(1)
  }
}
