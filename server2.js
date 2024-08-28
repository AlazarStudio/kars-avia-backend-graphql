import { ApolloServer } from 'apollo-server-express';
import { createServer } from 'http';
import express from 'express';
import { ApolloServerPluginDrainHttpServer } from 'apollo-server-core';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from "@graphql-tools/schema"
import mergedTypeDefs from "./typeDefs/typedefs.js"
import mergedResolvers from "./resolvers/resolvers.js"
 

const schema = makeExecutableSchema({
  typeDefs: mergedTypeDefs,
  resolvers: mergedResolvers
})
// create express and HTTP server
const app = express();
const httpServer = createServer(app);
 
// create websocket server
const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql',
});
 
// Save the returned server's info so we can shut down this server later
const serverCleanup = useServer({ schema }, wsServer);
 
// create apollo server
const apolloServer = new ApolloServer({
  schema,
  plugins: [
    // Proper shutdown for the HTTP server.
    ApolloServerPluginDrainHttpServer({ httpServer }),
 
    // Proper shutdown for the WebSocket server.
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
  ],
});
 
await apolloServer.start();
apolloServer.applyMiddleware({ app });
 
httpServer.listen(4000);

console.log('Starting server on port: 4000');