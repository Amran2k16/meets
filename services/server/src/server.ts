import express from "express";
import http from "http";
import cors, { type CorsOptions } from "cors";
import socket, { Server } from "socket.io";
import winston from "winston";
import { SOCKET_EVENTS, type ServerMessageData } from "shared";
import mediasoup, {
  types,
  version,
  observer,
  createWorker,
  getSupportedRtpCapabilities,
  parseScalabilityMode,
} from "mediasoup";
import { Room } from "./room";

const isDevelopment = process.env.NODE_ENV === "development";
const PORT = process.env.PORT ?? 3001;
var logLevel = process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info");
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
    : (origin, callback) => {
        if (!origin || origin.includes("localhost")) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
  optionsSuccessStatus: 200,
};

const worker = await createMediasoupWorker();
const rooms = new Map<string, Room>();

worker.on("died", () => {
  logger.warn("Media Soup Worker Died");
});

app.use(cors(corsOptions));

// Example usage of logger
logger.debug("Debugging information");
logger.info("Server is starting");
logger.warn("This is a warning");
logger.error("This is an error message");

app.get("/", (req, res) => {
  res.send("Hello World");
});

io.on("connection", async (socket) => {
  logger.info(`A user connected.`);
  logClientsCount();

  // Join a room
  socket.on(SOCKET_EVENTS.JOIN_ROOM, async ({ roomId }) => {
    try {
      const room = await getOrCreateRoom(roomId);
      console.log(`Socket ${socket.id} joined room: ${roomId}`);
      socket.join(roomId);
    } catch (error: any) {
      console.error("Error joining room:", error.message);
      socket.emit("error", { message: error.message });
    }
  });

  // Create transport
  socket.on(SOCKET_EVENTS.CREATE_TRANSPORT, async ({ roomId, direction }, callback) => {
    try {
      const transportParams = await createTransport(roomId, direction, socket.id);
      callback(transportParams);
    } catch (error: any) {
      console.error("Error creating transport:", error.message);
      callback({ error: error.message });
    }
  });

  socket.on(SOCKET_EVENTS.PRODUCE, async ({ roomId, kind, rtpParameters }, callback) => {
    try {
      const room = rooms.get(roomId);
      // INSERT_YOUR_CODE
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }
      const transport = room.transports.get(socket.id);

      if (!transport) throw new Error("Transport not found");

      // Create a Producer for the client's media
      const producer = await transport.produce({ kind, rtpParameters });

      // Store the producer in the room
      room.producers.set(socket.id, producer);

      console.log(`Producer created: kind=${kind}, producerId=${producer.id}`);
      callback({ id: producer.id });

      // Notify other clients about the new Producer
      socket.broadcast.to(roomId).emit("newProducer", { producerId: producer.id });
    } catch (error: any) {
      console.error("Error creating producer:", error);
      callback({ error: error.message });
    }
  });

  socket.on(SOCKET_EVENTS.CONSUME, async ({ roomId, producerId }, callback) => {
    try {
      const room = rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }

      const router = room.router;
      const transport = room.transports.get(socket.id);

      if (!transport) throw new Error("Transport not found");

      // Find the Producer the client wants to consume
      const producer = Array.from(room.producers.values()).find((p) => p.id === producerId);
      if (!producer) throw new Error("Producer not found");

      // Create a Consumer for the client's transport
      const consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities: router.rtpCapabilities, // Client's RTP capabilities
      });

      // Store the consumer in the room
      if (!room.consumers.has(socket.id)) {
        room.consumers.set(socket.id, []);
      }

      const consumers = room.consumers.get(socket.id);
      if (!consumers) {
        throw new Error("Consumers array is undefined for this socket ID");
      }

      consumers.push(consumer);

      console.log(`Consumer created: consumerId=${consumer.id}`);
      callback({
        id: consumer.id,
        producerId: producer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });

      // Handle consumer events (e.g., closed)
      consumer.on("transportclose", () => {
        console.log(`Consumer transport closed: consumerId=${consumer.id}`);
      });
    } catch (error: any) {
      console.error("Error creating consumer:", error);
      callback({ error: error.message });
    }
  });

  socket.on(SOCKET_EVENTS.DISCONNECT, async (reason) => {
    logger.info(`A user disconnected. Socket ID: ${socket.id}. Reason: ${reason}`);
    logClientsCount();
    for (const [roomId, room] of rooms.entries()) {
      if (room.transports.has(socket.id)) {
        room.transports.delete(socket.id);
        room.producers.delete(socket.id);
        room.consumers.delete(socket.id);
      }
    }
  });
});

const logClientsCount = async () => {
  logger.info(`Current number of connected clients: ${io.engine.clientsCount}`);
  // all sockets in the main namespace
  const ids = await io.fetchSockets();
  ids.forEach((socket) => logger.info(`Socket ID: ${socket.id}`));
};

// Initialize the mediasoup worker
async function createMediasoupWorker() {
  const mediasoupWorker = await mediasoup.createWorker({
    rtcMinPort: 10000, // Port range for WebRTC connections
    rtcMaxPort: 10100, // Adjust as needed
    logLevel: logLevel,
    logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
  });

  console.log("Mediasoup Worker created");

  // Handle worker errors
  mediasoupWorker.on("died", () => {
    console.error("Mediasoup Worker died, restarting...");
    process.exit(1); // Exit process if worker crashes
  });

  return mediasoupWorker;
}

export async function getOrCreateRoom(roomId: string) {
  if (rooms.has(roomId)) {
    return rooms.get(roomId);
  }

  // Create a new Router for the room
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

  console.log(`Created router for room: ${roomId}`);
  return room;
}

async function createTransport(roomId: string, direction: string, socketId: string) {
  const room = rooms.get(roomId);
  if (!room) throw new Error(`Room ${roomId} not found`);

  // Create a WebRTC transport
  const transport = await room.router.createWebRtcTransport({
    listenIps: [{ ip: "127.0.0.1", announcedIp: null }], // Replace with your server's public IP
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  // Log transport details
  console.log(`${direction} transport created for room: ${roomId}, transportId: ${transport.id}`);

  // Store transport in the room
  room.transports.set(socketId, transport);

  // Return transport parameters to the client
  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };
}

server.listen(PORT, () => {
  logger.info(`HTTP server is running on port ${PORT}`);
});
