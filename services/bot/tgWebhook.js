app.post("/webhook/telegram", async (request, response) => {
    console.log("В бота написали сообщение")

    const { message } = request.body

    // Взять нужные значения из message и отправить их в бд (из бд отправить на фронтенд)
    

    response.sendStatus(200)

    await prisma.message.create({
      data: {
        text: message.text,
        chatId: message.chat.id,
        senderId: message.from.id,
      }
    })

    console.log(message)
})