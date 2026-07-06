// routes/botWebhooks.js

import express from 'express'
import { botService } from '../services/bot/botService.js'

const router = express.Router()

// Webhook для MAX
router.post('/MAX', async (req, res) => {
  try {
    const update = req.body
    
    if (update.message) {
      await botService.handleIncomingMessage('MAX', {
        chatId: update.message.chat.id.toString(),
        userId: update.message.from.id.toString(),
        messageId: update.message.message_id.toString(),
        text: update.message.text || '',
        userData: {
          firstName: update.message.from.first_name,
          lastName: update.message.from.last_name
        }
      })
    }
    
    res.sendStatus(200)
  } catch (error) {
    console.error('Ошибка webhook:', error)
    res.sendStatus(500)
  }
})



export default router