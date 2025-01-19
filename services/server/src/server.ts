// server/server.ts
import express from "express";
import http from "http";
import cors, { type CorsOptions } from "cors";
import { Server } from "socket.io";
import winston from "winston";
import mediasoup from "mediasoup"; // { createWorker, types, etc. } as needed
import { Room } from "./room";

import { SOCKET_EVENTS } from "shared"; // adjust path as needed

const isDevelopment = process.env.NODE_ENV === "development";
const PORT = process.env.PORT ?? 3001;
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info");

/*********************************************************
 * Winston Logger
 *********************************************************/
const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

if (isDevelopment) {
  logger.debug("Running in development mode");
}

/*********************************************************
 * Express + Socket.IO Setup
 *********************************************************/
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: "/socket.io",
  cors: {
    origin: isDevelopment ? "*" : process.env.PRODUCTION_DOMAIN,
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
});

const corsOptions: CorsOptions = {
  origin: isDevelopment
    ? "*"
    : (origin, response) => {
        if (!origin || origin.includes("localhost")) {
          response(null, true);
        } else {
          response(new Error("Not allowed by CORS"));
        }
      },
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

/*********************************************************
 * Mediasoup Worker
 *********************************************************/
const worker = await mediasoup.createWorker({
  rtcMinPort: 10000,
  rtcMaxPort: 10100,
  logLevel: logLevel,
  logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
});

logger.info("Mediasoup Worker created");

worker.on("died", () => {
  logger.error("Mediasoup Worker died, exiting...");
  process.exit(1);
});

/*********************************************************
 * Rooms Map
 *********************************************************/
const rooms = new Map<string, Room>();

app.get("/", (req, res) => {
  res.send("Hello World");
});

/*********************************************************
 * Socket.IO Connection
 *********************************************************/
io.on("connection", (socket) => {
  logger.info(`A user connected. Socket ID: ${socket.id}`);
  logClientsCount();

  /*********************************************************
   * 1) JOIN_ROOM
   *********************************************************/
  socket.on(SOCKET_EVENTS.JOIN_ROOM, async ({ roomId }, response) => {
    try {
      const room = await getOrCreateRoom(roomId);

      // Join this socket into the room
      socket.join(roomId);
      logger.info(`Socket ${socket.id} joined room: ${roomId}`);

      // Collect the IDs of any existing producers
      const existingProducerIds = Array.from(room.producers.keys());
      logger.info(`Existing producers in room ${roomId}: ${existingProducerIds.join(", ")}`);

      // Send back success + the existing producer IDs
      response({
        success: true,
        message: `Joined room: ${roomId}`,
        existingProducerIds,
      });
    } catch (error: any) {
      logger.error("Error joining room:", error.message);
      response({ success: false, message: error.message });
    }
  });

  /*********************************************************
   * 2) GET_ROUTER_CAPABILITIES
   *********************************************************/
  socket.on(SOCKET_EVENTS.GET_ROUTER_CAPABILITIES, (data, response) => {
    try {
      logger.info(`Received getRouterRtpCapabilities from socket: ${socket.id}`);

      const { roomId } = data;
      if (!roomId) {
        throw new Error("Room ID not provided");
      }

      const room = rooms.get(roomId);
      if (!room) {
        throw new Error(`Room with ID ${roomId} not found`);
      }

      const rtpCapabilities = room.router.rtpCapabilities;
      response(rtpCapabilities);
    } catch (error: any) {
      logger.error("Error in getRouterRtpCapabilities:", error.message);
      response({ error: error.message });
    }
  });

  /*********************************************************
   * 3) CREATE_TRANSPORT
   *********************************************************/
  socket.on(SOCKET_EVENTS.CREATE_TRANSPORT, async ({ roomId, direction }, response) => {
    try {
      const transportParams = await createTransport(roomId, direction);
      logger.info(`Transport created for roomId: ${roomId}, direction: ${direction}, socketId: ${socket.id}`);
      response(transportParams);
    } catch (error: any) {
      logger.error("Error creating transport:", error.message);
      response({ error: error.message });
    }
  });

  /*********************************************************
   * 4) CONNECT_TRANSPORT
   *********************************************************/
  socket.on(SOCKET_EVENTS.CONNECT_TRANSPORT, async ({ transportId, dtlsParameters }, response) => {
    try {
      logger.info(`Socket ${socket.id} connecting transport: ${transportId}`);

      // Find which room has this transport
      const [foundRoomId, foundRoom] = Array.from(rooms.entries()).find(([_, r]) => r.transports.has(transportId)) || [
        null,
        null,
      ];

      if (!foundRoomId || !foundRoom) {
        throw new Error(`Room not found for transportId: ${transportId}`);
      }
      const transport = foundRoom.transports.get(transportId);
      if (!transport) {
        throw new Error(`Transport with ID ${transportId} not found`);
      }

      await transport.connect({ dtlsParameters });
      logger.info(`Transport ${transportId} connected successfully for room: ${foundRoomId}`);
      response({ success: true });
    } catch (error: any) {
      logger.error("Error connecting transport:", error.message);
      response({ error: error.message });
    }
  });

  /*********************************************************
   * 5) PRODUCE
   *********************************************************/
  socket.on(SOCKET_EVENTS.PRODUCE, async ({ roomId, transportId, kind, rtpParameters }, response) => {
    try {
      const room = rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }
      const transport = room.transports.get(transportId);
      if (!transport) {
        throw new Error(`Transport with ID ${transportId} not found`);
      }

      // Create a Producer
      const producer = await transport.produce({ kind, rtpParameters });
      room.producers.set(producer.id, producer); // store by producer.id

      logger.info(`Producer created: kind=${kind}, producerId=${producer.id} (transportId=${transportId})`);

      // Acknowledge to the client
      response({ id: producer.id });

      // Notify other clients in the same room
      socket.broadcast.to(roomId).emit(SOCKET_EVENTS.NEW_PRODUCER, { producerId: producer.id });

      // Clean up on transport close
      producer.on("transportclose", () => {
        logger.info(`Producer's transport closed. ProducerId=${producer.id}`);
        room.producers.delete(producer.id);
      });
      // Clean up on producer close
      producer.on("close", () => {
        logger.info(`Producer closed. ProducerId=${producer.id}`);
        room.producers.delete(producer.id);
      });
    } catch (error: any) {
      logger.error("Error creating producer:", error.message);
      response({ error: error.message });
    }
  });

  /*********************************************************
   * 6) CONSUME
   *********************************************************/
  socket.on(SOCKET_EVENTS.CONSUME, async ({ roomId, producerId, transportId }, response) => {
    logger.info(
      `Consume event received with inputs: roomId=${roomId}, producerId=${producerId}, transportId=${transportId}`
    );
    try {
      const room = rooms.get(roomId);
      if (!room) {
        logger.error(`Room ${roomId} not found`);
        throw new Error(`Room ${roomId} not found`);
      }
      logger.info(`Room ${roomId} found`);

      const router = room.router;
      const transport = room.transports.get(transportId);
      if (!transport) {
        logger.error(`Transport with ID ${transportId} not found`);
        throw new Error(`Transport with ID ${transportId} not found`);
      }
      logger.info(`Transport with ID ${transportId} found`);

      const producer = room.producers.get(producerId);
      if (!producer) {
        logger.error(`Producer with ID ${producerId} not found`);
        throw new Error("Producer not found");
      }
      logger.info(`Producer with ID ${producerId} found`);

      // Create a Consumer
      const consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities: router.rtpCapabilities,
      });
      logger.info(`Consumer created: consumerId=${consumer.id}, producerId=${producerId}`);

      // Add consumer to the map
      if (!room.consumers.has(socket.id)) {
        room.consumers.set(socket.id, []);
      }
      room.consumers.get(socket.id)!.push(consumer);
      logger.info(`Consumer added to room: consumerId=${consumer.id}, socketId=${socket.id}`);

      response({
        id: consumer.id,
        producerId: producer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });

      consumer.on("transportclose", () => {
        logger.info(`Consumer transport closed: consumerId=${consumer.id}`);
      });
    } catch (error: any) {
      logger.error("Error creating consumer:", error.message);
      response({ error: error.message });
    }
  });

  /*********************************************************
   * DISCONNECT
   *********************************************************/
  // DISCONNECT
  socket.on(SOCKET_EVENTS.DISCONNECT, async (reason) => {
    logger.info(`A user disconnected. Socket ID: ${socket.id}. Reason: ${reason}`);
    logClientsCount();

    // ----------------------------------------------------------
    // Clean up any references in rooms for this socket
    // ----------------------------------------------------------
    for (const [roomId, room] of rooms.entries()) {
      rooms.forEach((room, roomId) => {
        logger.info(`Room ID: ${roomId}, Room: ${JSON.stringify(room)}`);

        // Log the producers map in general
        logger.info(`Producers in room ${roomId}: ${JSON.stringify(Array.from(room.producers.entries()))}`);

        // 1) Close and remove transports belonging to this socket
        room.transports.forEach((entry, transportId) => {
          if (entry.socketId === socket.id) {
            entry.transport.close();
            room.transports.delete(transportId);
          }
        });

        // 2) Close and remove producers belonging to this socket
        room.producers.forEach((entry, producerId) => {
          if (entry.socketId === socket.id) {
            logger.info(`Found producer matching socket ID ${socket.id}: ${producerId}`);
            entry.producer.close(); // triggers 'producer.on("close")'
            room.producers.delete(producerId);
          }
        });

        // 3) Close and remove consumers belonging to this socket
        room.consumers.forEach((entry, consumerId) => {
          if (entry.socketId === socket.id) {
            entry.consumer.close();
            room.consumers.delete(consumerId);
          }
        });

        // 4) If the room is now empty, remove it entirely
        if (room.transports.size === 0 && room.producers.size === 0 && room.consumers.size === 0) {
          logger.info(`Room ${roomId} is now empty, removing it...`);
          rooms.delete(roomId);
        }
      });
    }
  });
});

/*********************************************************
 * Utility Functions
 *********************************************************/
async function getOrCreateRoom(roomId: string) {
  if (rooms.has(roomId)) {
    logger.info(`Room ${roomId} already exists`);
    return rooms.get(roomId)!;
  }

  const router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: {
          "x-google-start-bitrate": 1000,
        },
      },
    ],
  });

  const room = new Room(router);
  rooms.set(roomId, room);

  logger.info(`Created new router for room: ${roomId} (total: ${rooms.size})`);
  return room;
}

async function createTransport(roomId: string, direction: "send" | "recv") {
  const room = rooms.get(roomId);
  if (!room) throw new Error(`Room ${roomId} not found`);

  const transport = await room.router.createWebRtcTransport({
    listenIps: [{ ip: "127.0.0.1", announcedIp: null }], // Replace with your public IP
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  // Store the transport by its own ID
  room.transports.set(transport.id, transport);

  logger.info(`${direction.toUpperCase()} Transport created for room ${roomId}, transportId=${transport.id}`);

  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };
}

async function logClientsCount() {
  logger.info(`Current number of connected clients: ${io.engine.clientsCount}`);
  const sockets = await io.fetchSockets();
  sockets.forEach((s) => {
    logger.info(` - Socket ID: ${s.id}`);
  });
}

/*********************************************************
 * Start the HTTP + Socket.IO Server
 *********************************************************/
server.listen(PORT, () => {
  logger.info(`HTTP server is running on port ${PORT}`);
});
