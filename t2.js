import express from "express"

const app = express();
const PORT = 3000;

// ВАЖНО: Wazzup отправляет данные именно в формате JSON
app.use(express.json());

// Этот URL вы укажете в настройках Webhook в Wazzup
app.post('/webhook/wazzup', (req, res) => {
    // Всегда сразу отвечайте 200 OK, чтобы Wazzup знал, что webhook принят
    res.status(200).send('OK');

    const webhookData = req.body;

    // Структура данных для события message.add
    // Сверяйте с актуальной документацией Wazzup
    if (webhookData && webhookData.messages) {
        webhookData.messages.forEach(message => {
            // Фильтруем сообщения только из ВК, чтобы не обрабатывать лишнее
            if (message.chatType === 'vk') {
                console.log('-----------------------------\n');
                console.log('Текст сообщения:', message.text);
                console.log('ID чата (chatId):', message.chatId);
                console.log('ID канала (channelId):', message.channelId);
                console.log('Тип отправителя:', message.authorType);
                console.log('Имя отправителя:', message.authorName);
                console.log('Время:', new Date(message.dateTime));
                console.log('-----------------------------\n');

                // Здесь вы можете написать свою бизнес-логику:
                // - сохранить сообщение в базу данных
                // - запустить сценарий чат-бота
                // - переслать уведомление
            } else {
                console.log(`Получено сообщение из другого канала: ${message.chatType}`);
            }
        });
    }
});

app.get("/hello", (req, res) => {
    console.log("Тестовое сообщение, чтобы сервер не остановился")
    res.send("hi")
})

app.listen(PORT, () => {
    console.log(`Сервер для приема webhooks запущен на http://localhost:${PORT}`);
});











