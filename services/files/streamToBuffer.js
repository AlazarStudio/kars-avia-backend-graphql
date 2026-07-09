export const streamToBuffer = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = []
    stream.on("data", (c) => chunks.push(c))
    stream.on("error", reject)
    stream.on("end", () => resolve(Buffer.concat(chunks)))
  })
