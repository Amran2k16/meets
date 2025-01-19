// server/server.ts
import express from "express";
import http from "http";
import cors, { type CorsOptions } from "cors";
import { Server } from "socket.io";
import winston, { transport } from "winston";
import mediasoup, { type types as mediaSoupTypes } from "mediasoup"; // { createWorker, types, etc. } as needed
import { Room } from "./room";

import { SOCKET_EVENTS, type ConsumerData, type SocketResponse, type TransportData } from "shared"; // adjust path as needed
import type { WebRtcTransport, WebRtcTransportOptions } from "mediasoup/node/lib/WebRtcTransportTypes";
import type { Consumer } from "mediasoup/node/lib/ConsumerTypes";

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
  socket.on(SOCKET_EVENTS.JOIN_ROOM, async ({ roomId }, response: SocketResponse<string[]>) => {
    const room = await getOrCreateRoom(roomId);

    // Join this socket into the room
    socket.join(roomId);
    logger.info(`Socket ${socket.id} joined room: ${roomId}`);

    // Collect the IDs of any existing producers
    const existingProducerIds = Array.from(room.producers.entries())
      .filter(([producerSocketId]) => producerSocketId !== socket.id)
      .flatMap(([, producersMap]) => Array.from(producersMap.keys()));

    logger.info(`Existing producers in room ${roomId}: ${existingProducerIds.join(", ")}`);

    // Send back success + the existing producer IDs
    response({
      success: true,
      message: `Joined room: ${roomId}`,
      data: existingProducerIds,
    });
  });

  /*********************************************************
   * 2) GET_ROUTER_CAPABILITIES
   *********************************************************/
  socket.on(
    SOCKET_EVENTS.GET_ROUTER_CAPABILITIES,
    (data: { roomId: string; direction: string }, response: SocketResponse<mediaSoupTypes.RtpCapabilities>) => {
      logger.info(`Received getRouterRtpCapabilities from socket: ${socket.id}`);

      const { roomId } = data;
      logger.info(`Room ID received: ${roomId}`);

      if (!roomId) {
        logger.error("Room ID not provided");
        return response({ success: false, message: "Room ID not provided" });
      }

      const room = rooms.get(roomId);
      if (!room) {
        logger.error(`Room with ID ${roomId} not found`);
        return response({ success: false, message: `Room with ID ${roomId} not found` });
      }

      const rtpCapabilities = room.router.rtpCapabilities;
      logger.info(`Sending RTP capabilities response to socket: ${socket.id}`);
      response({ success: true, data: rtpCapabilities });
    }
  );

  /*********************************************************
   * 3) CREATE_TRANSPORT
   *********************************************************/
  socket.on(SOCKET_EVENTS.CREATE_TRANSPORT, async ({ roomId, direction }, response: SocketResponse<TransportData>) => {
    const room = rooms.get(roomId);

    if (!room) {
      return response({ success: false, message: `CREATE_TRANSPORT : RoomID not found` });
    }

    const [transportError, transport] = await handleAsync<mediaSoupTypes.WebRtcTransport>(
      room.router.createWebRtcTransport({
        listenIps: [{ ip: "127.0.0.1" }], // Replace with your public IP
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      })
    );

    if (transportError) {
      logger.error("Error creating transport:", transportError.message);
      return response({ success: false, message: transportError.message });
    }
    if (!transport) {
      logger.error("Transport creation failed: transport is null");
      return response({ success: false, message: "Transport creation failed: transport is null" });
    }
    const socketTransports = room.transports.get(socket.id) || new Map();
    socketTransports.set(transport.id, transport);
    room.transports.set(socket.id, socketTransports);

    logger.info(
      `Transport created for roomId: ${roomId}, direction: ${direction}, transportId=${transport.id}, socketId: ${socket.id}`
    );

    const data: TransportData = {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters || undefined,
    };
    return response({ success: true, data });
  });

  /*********************************************************
   * 4) CONNECT_TRANSPORT
   *********************************************************/
  socket.on(
    SOCKET_EVENTS.CONNECT_TRANSPORT,
    async ({ roomId, transportId, dtlsParameters }, response: SocketResponse<null>) => {
      logger.info(`Socket ${socket.id} connecting transport: ${transportId}`);

      // Find the room using the provided roomId
      const foundRoom = rooms.get(roomId);

      if (!foundRoom) {
        logger.error(`Room not found for roomId: ${roomId} 207`);
        return response({ success: false, message: `Room not found for roomId: ${roomId}` });
      }

      // Iterate the room's transports to find the entry with the socket id
      const transport = foundRoom.transports.get(socket.id)?.get(transportId);

      if (!transport) {
        logger.error(`Transport with ID ${transportId} not found`);
        return response({ success: false, message: `Transport with ID ${transportId} not found` });
      }

      const [connectError, _] = await handleAsync(transport.connect({ dtlsParameters }));

      if (connectError) {
        logger.error(
          `Failed to connect transport ${transportId} for room: ${roomId} socket ${socket.id}`,
          connectError
        );
        return response({ success: false, message: connectError.message });
      }

      logger.info(`Transport ${transportId} connected successfully for room: ${roomId}`);
      response({ success: true, data: null });
    }
  );

  /*********************************************************
   * 5) PRODUCE
   *********************************************************/
  socket.on(SOCKET_EVENTS.PRODUCE, async ({ roomId, transportId, kind, rtpParameters }, response) => {
    const room = rooms.get(roomId);

    if (!room) {
      return response({ success: false, message: `Room ${roomId} not found` });
    }

    const transport = room.transports.get(socket.id)?.get(transportId);

    if (!transport) {
      return response({ success: false, message: `Transport with ID ${transportId} not found` });
    }

    const [produceError, producer] = await handleAsync<any>(transport.produce({ kind, rtpParameters }));

    if (produceError) {
      logger.error(`Failed to create producer: ${produceError.message}`);
      return response({ success: false, message: produceError.message });
    }

    if (!room.producers.has(socket.id)) {
      room.producers.set(socket.id, new Map());
    }
    room.producers.get(socket.id)?.set(producer.id, producer);

    logger.info(`Producer created: kind=${kind}, producerId=${producer.id} (transportId=${transportId})`);

    // Acknowledge to the client
    response({ success: true, data: { id: producer.id } });

    // Notify other clients in the same room
    socket.broadcast.to(roomId).emit(SOCKET_EVENTS.NEW_PRODUCER, { producerId: producer.id });

    // Clean up on transport close
    producer.on("transportclose", () => {
      logger.info(`Producer's transport closed. ProducerId=${producer.id}`);
      room.producers.get(socket.id)?.delete(producer.id);
      if (room.producers.get(socket.id)?.size === 0) {
        room.producers.delete(socket.id);
      }
    });
    // Clean up on producer close
    producer.on("close", () => {
      logger.info(`Producer closed. ProducerId=${producer.id}`);
      room.producers.get(socket.id)?.delete(producer.id);
      if (room.producers.get(socket.id)?.size === 0) {
        room.producers.delete(socket.id);
      }
    });
  });

  /*********************************************************
   * 6) CONSUME
   *********************************************************/
  socket.on(
    SOCKET_EVENTS.CONSUME,
    async ({ roomId, producerId, transportId }, response: SocketResponse<ConsumerData>) => {
      logger.error(
        `Consume event received with inputs: roomId=${roomId}, producerId=${producerId}, transportId=${transportId}`
      );

      const room = rooms.get(roomId);
      if (!room) {
        logger.error(`Room ${roomId} not found`);
        throw new Error(`Room ${roomId} not found`);
      }
      logger.debug(`Room ${roomId} found`);

      const router = room.router;

      const transport = Array.from(room.transports.values())
        .flatMap((transportsMap) => Array.from(transportsMap.values()))
        .find((t) => t.id === transportId);

      if (!transport) {
        logger.error(`Transport with ID ${transportId} not found`);
        throw new Error(`Transport with ID ${transportId} not found`);
      }
      logger.debug(`Transport with ID ${transportId} found`);

      const producerKeys = Array.from(room.producers.values()).flatMap((producersMap) =>
        Array.from(producersMap.keys())
      );
      logger.info(`Producer keys in room ${roomId}: ${producerKeys.join(", ")}`);

      const producer =
        Array.from(room.producers.values())
          .flatMap((producersMap) => Array.from(producersMap.values()))
          .find((entry) => entry.id === producerId) || null;

      if (!producer) {
        logger.error(`Producer with ID ${producerId} not found`);
        throw new Error("Producer not found");
      }

      logger.debug(`Producer with ID ${producerId} found`);

      // Create a Consumer
      const consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities: router.rtpCapabilities,
      });

      logger.debug(`Consumer created: consumerId=${consumer.id}, producerId=${producerId}`);

      // Add consumer to the map
      if (!room.consumers.has(socket.id)) {
        room.consumers.set(socket.id, new Map());
      }
      room.consumers.get(socket.id)?.set(consumer.id, consumer);
      logger.debug(`Consumer added to room: consumerId=${consumer.id}, socketId=${socket.id}`);
      const data: ConsumerData = {
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
      };

      logger.info(`Consumer data: ${JSON.stringify(data)}`);

      response({
        success: true,
        data,
      });

      consumer.on("transportclose", () => {
        logger.debug(`Consumer transport closed: consumerId=${consumer.id}`);
      });
    }
  );

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
        room.consumers.delete(socket.id);
        room.transports.delete(socket.id);
        room.producers.delete(socket.id);
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

  const [transportError, transport] = await handleAsync<mediaSoupTypes.WebRTC>(
    room.router.createWebRtcTransport({
      listenIps: [{ ip: "127.0.0.1", announcedIp: null }], // Replace with your public IP
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    })
  );

  if (transportError) {
    throw new Error(`Failed to create WebRTC transport: ${transportError.message}`);
  }

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

async function handleAsync<T>(promise: Promise<T>): Promise<[Error | null, T | null]> {
  try {
    const result = await promise;
    return [null, result];
  } catch (error: any) {
    return [new Error(error.message || "Unknown error"), null];
  }
}

/*********************************************************
 * Start the HTTP + Socket.IO Server
 *********************************************************/
server.listen(PORT, () => {
  logger.info(`HTTP server is running on port ${PORT}`);
});
