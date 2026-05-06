import axios from 'axios'




// async function f() {
//     const getChannels = await axios.get("https://api.wazzup24.com/v3/channels", {
//         headers: {
//             Authorization: `Bearer ${API_TOKEN}`
//         }
//     })

//     console.log(getChannels.data)
// }

// f()

const API_TOKEN = '00493eb27ffb45e8992da39a817428df'; // Тот же ключ, что и для получения каналов

// const WEBHOOK_URL = 'https://quick-swans-bake.loca.lt/webhook/wazzup'; // Замените на РЕАЛЬНЫЙ адрес вашего сервера

// async function enableWebhook() {
//   try {
//     const response = await axios.patch(
//       'https://api.wazzup24.com/v3/webhooks',
//       {
//         webhooksUri: WEBHOOK_URL,
//         subscriptions: {
//           messagesAndStatuses: true, // Подписываемся на новые сообщения и статусы
//           // остальные подписки по желанию можно оставить выключенными
//         },
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${API_TOKEN}`,
//           'Content-Type': 'application/json',
//         },
//       }
//     );
//     console.log('✅ Вебхуки успешно активированы:', response.data);
//   } catch (error) {
//     console.error('❌ Ошибка при активации вебхуков:', error.response?.data || error.message);
//     console.log()
//     console.log(error)
//   }
// }

// enableWebhook();


async function sendMessageToVK(chatId, messageText) {
  const response = await axios.post(
    'https://api.wazzup24.com/v3/message',
    {
      channelId: '33183f35-28e0-49b2-84ae-c99ef3e5a9f8',
      chatId: chatId,
      chatType: 'vk',
      text: messageText,
    },
    {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
  console.log('Ответ отправлен:', response.data);
}


sendMessageToVK("530663708", "HELLO")







































// async function sendMessageToMAX() {
//   const response = await axios.post(
//     'https://api.wazzup24.com/v3/message',
//     {
//       channelId: '211ae44c-0a1c-4600-a54e-9219fb8fc0de',
//       chatId: "91068854",
//       chatType: 'max',
//       text: "Lol keck cheburek",
//     },
//     {
//       headers: {
//         Authorization: `Bearer ${API_TOKEN}`,
//         'Content-Type': 'application/json',
//       },
//     }
//   );
//   console.log('Ответ отправлен:', response.data);
// }



// sendMessageToMAX()