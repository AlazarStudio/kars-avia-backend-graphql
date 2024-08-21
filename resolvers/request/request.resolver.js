import { prisma } from '../../prisma.js';
import { PubSub } from 'graphql-subscriptions';

const pubsub = new PubSub();
const REQUEST_CREATED = 'REQUEST_CREATED';

const requestResolver = {
  Mutation: {
    createRequest: async (_, { input }) => {
      const {
        fullName,
        position,
        gender,
        phoneNumber,
        airport,
        arrival,
        departure,
        roomCategory,
        mealPlan
      } = input;

      // Создание заявки
      const newRequest = await prisma.request.create({
        data: {
          fullName,
          position,
          gender,
          phoneNumber,
          airport,
          arrival,
          departure,
          roomCategory,
          mealPlan
        }
      });

      // Публикация события после создания заявки
      pubsub.publish(REQUEST_CREATED, { requestCreated: newRequest });

      return newRequest;
    }
  },
  Subscription: {
    requestCreated: {
      subscribe: () => pubsub.asyncIterator([REQUEST_CREATED]),
    }
  }
};

export default requestResolver;
