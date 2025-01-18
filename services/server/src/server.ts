import { serve } from "bun";
import express from "express";
import { Server as SocketIOServer } from "socket.io";
import http from "http";
import * as mediasoup from "mediasoup";
import type { Router, Worker, WebRtcTransport, Producer, RtpCapabilities } from "mediasoup/node/lib/types";

// -------------------------------------------
// Logger utility
// -------------------------------------------
const logger = (level: string, message: string) => {
  const levels = ["error", "warn", "info", "debug"];
  const currentLevel = "debug"; // or "info" if you want less verbosity
  if (levels.indexOf(level) <= levels.indexOf(currentLevel)) {
    console.log(`[${level.toUpperCase()}] ${message}`);
  }
};

// -------------------------------------------
// Express & Socket.io
// -------------------------------------------
const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "http://localhost:3000", // Next.js origin
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// -------------------------------------------
// Mediasoup
// -------------------------------------------
let worker: Worker;
const roomRouters = new Map<string, Router>();
// Store { [roomName]: { [socketId]: { sendTransport, recvTransport, producers: Producer[] } } }
const roomState = new Map<
  string,
  Record<
    string,
    {
      sendTransport?: WebRtcTransport;
      recvTransport?: WebRtcTransport;
      producers: Producer[];
    }
  >
>();

async function createMediasoupWorker() {
  worker = await mediasoup.createWorker({
    logLevel: "debug",
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
  });
  logger("info", "Mediasoup worker created");
}

async function getOrCreateRouter(roomName: string) {
  if (roomRouters.has(roomName)) {
    return roomRouters.get(roomName)!;
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
        parameters: { "x-google-start-bitrate": 1000 },
      },
    ],
  });
  roomRouters.set(roomName, router);
  roomState.set(roomName, {});
  logger("info", `Router created for room: ${roomName}`);
  return router;
}

// -------------------------------------------
// Socket.io logic
// -------------------------------------------
io.on("connection", (socket) => {
  logger("info", `New client => ${socket.id}`);

  socket.on("joinRoom", async ({ roomName }, callback) => {
    logger("info", `Socket ${socket.id} joined room: ${roomName}`);
    const router = await getOrCreateRouter(roomName);

    // Ensure roomState structure
    if (!roomState.has(roomName)) {
      roomState.set(roomName, {});
    }
    const roomObj = roomState.get(roomName)!;
    roomObj[socket.id] = { producers: [] }; // initialize

    // Create sendTransport
    const sendTransport = await router.createWebRtcTransport({
      listenIps: [{ ip: "0.0.0.0", announcedIp: undefined }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });
    logger("info", `SendTransport created => ${sendTransport.id}`);
    roomObj[socket.id].sendTransport = sendTransport;

    // Create recvTransport
    const recvTransport = await router.createWebRtcTransport({
      listenIps: [{ ip: "0.0.0.0", announcedIp: undefined }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });
    logger("info", `RecvTransport created => ${recvTransport.id}`);
    roomObj[socket.id].recvTransport = recvTransport;

    // Return necessary data to client
    callback({
      routerRtpCapabilities: router.rtpCapabilities,
      sendTransportParams: {
        id: sendTransport.id,
        iceParameters: sendTransport.iceParameters,
        iceCandidates: sendTransport.iceCandidates,
        dtlsParameters: sendTransport.dtlsParameters,
      },
      recvTransportParams: {
        id: recvTransport.id,
        iceParameters: recvTransport.iceParameters,
        iceCandidates: recvTransport.iceCandidates,
        dtlsParameters: recvTransport.dtlsParameters,
      },
    });

    // Join the socket.io room
    socket.join(roomName);
  });

  // connectTransport => used for DTLS finalization
  socket.on("connectTransport", async ({ transportType, dtlsParameters }, cb) => {
    logger("info", `connectTransport => Socket: ${socket.id}, Type: ${transportType}`);
    // Find the correct transport
    const { roomName } = socket.handshake.query;
    if (!roomName) {
      logger("error", "No roomName in handshake query");
      cb({ connected: false, error: "No room name" });
      return;
    }
    const roomObj = roomState.get(roomName as string);
    if (!roomObj || !roomObj[socket.id]) {
      logger("error", `No state for this socket in room: ${roomName}`);
      cb({ connected: false, error: "No transport" });
      return;
    }

    let transport: WebRtcTransport | undefined = undefined;
    if (transportType === "send") {
      transport = roomObj[socket.id].sendTransport;
    } else {
      transport = roomObj[socket.id].recvTransport;
    }
    if (!transport) {
      cb({ connected: false, error: "Transport not found" });
      return;
    }

    try {
      await transport.connect({ dtlsParameters });
      cb({ connected: true });
    } catch (err) {
      logger("error", `Transport connect error => ${err}`);
      cb({ connected: false, error: err });
    }
  });

  // produce => client wants to create a producer
  socket.on("produce", async ({ transportType, kind, rtpParameters }, cb) => {
    logger("info", `Socket ${socket.id} produce => kind: ${kind}`);
    const { roomName } = socket.handshake.query;
    if (!roomName) {
      logger("error", "No roomName in handshake query for produce");
      cb({ error: "No room name" });
      return;
    }
    const roomObj = roomState.get(roomName as string);
    if (!roomObj || !roomObj[socket.id]) {
      logger("error", `No state for this socket in room produce => ${socket.id}`);
      cb({ error: "No transport" });
      return;
    }

    let transport = roomObj[socket.id].sendTransport;
    if (transportType !== "send" || !transport) {
      cb({ error: "Send transport not found" });
      return;
    }

    try {
      const producer = await transport.produce({ kind, rtpParameters });
      roomObj[socket.id].producers.push(producer);

      logger("info", `Producer created => ${producer.id}`);
      cb({ id: producer.id });

      // Notify other participants in the room
      // so they can consume this new producer
      socket.to(roomName as string).emit("newProducer", {
        socketId: socket.id,
        producerId: producer.id,
      });
    } catch (err) {
      logger("error", `Produce error => ${err}`);
      cb({ error: err });
    }
  });

  // getProducers => returns list of producers in the room
  socket.on("getProducers", ({ roomName }, cb) => {
    const roomObj = roomState.get(roomName);
    if (!roomObj) {
      cb([]);
      return;
    }
    let allProducers: { socketId: string; producerId: string }[] = [];
    for (const [socketId, data] of Object.entries(roomObj)) {
      for (const producer of data.producers) {
        allProducers.push({
          socketId,
          producerId: producer.id,
        });
      }
    }
    cb(allProducers);
  });

  // consume => client wants to create a consumer for a specific producer
  socket.on("consume", async ({ transportType, producerId, rtpCapabilities }, cb) => {
    logger("info", `consume => Socket: ${socket.id} wants to consume producer: ${producerId}`);
    const { roomName } = socket.handshake.query;
    if (!roomName) {
      cb({ error: "No room name" });
      return;
    }
    const router = roomRouters.get(roomName as string);
    if (!router) {
      cb({ error: "No router for this room" });
      return;
    }
    const roomObj = roomState.get(roomName as string);
    if (!roomObj || !roomObj[socket.id]) {
      cb({ error: "No room state for this socket" });
      return;
    }
    let transport: WebRtcTransport | undefined =
      transportType === "recv" ? roomObj[socket.id].recvTransport : undefined;
    if (!transport) {
      cb({ error: "No recv transport" });
      return;
    }

    // Find the producer
    let foundProducer: Producer | undefined;
    for (const [sId, data] of Object.entries(roomObj)) {
      const p = data.producers.find((prod) => prod.id === producerId);
      if (p) {
        foundProducer = p;
        break;
      }
    }
    if (!foundProducer) {
      cb({ error: "Producer not found" });
      return;
    }

    // Check if we can consume
    if (!router.canConsume({ producerId, rtpCapabilities })) {
      logger("warn", `Cannot consume => producerId: ${producerId}`);
      cb({ error: "Cannot consume" });
      return;
    }

    try {
      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: false,
      });
      logger("info", `Consumer created => ID: ${consumer.id}, kind: ${consumer.kind}`);

      consumer.on("transportclose", () => {
        logger("info", `Consumer transport closed => consumer.id: ${consumer.id}`);
      });

      cb({
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (err) {
      logger("error", `Consume error => ${err}`);
      cb({ error: err });
    }
  });

  // Cleanup if user disconnects
  socket.on("disconnect", () => {
    const { roomName } = socket.handshake.query;
    if (roomName) {
      const roomObj = roomState.get(roomName as string);
      if (roomObj && roomObj[socket.id]) {
        // Close any producers
        for (const producer of roomObj[socket.id].producers) {
          producer.close();
        }
        // Close transports
        roomObj[socket.id].sendTransport?.close();
        roomObj[socket.id].recvTransport?.close();
        delete roomObj[socket.id];
      }
      // Let others know participant left
      socket.to(roomName as string).emit("participantLeft", socket.id);
    }
    logger("info", `Socket disconnected => ${socket.id}`);
  });
});

// -------------------------------------------
// Express routes
// -------------------------------------------
app.get("/", (req, res) => {
  res.send("Hello from Bun + Express + mediasoup!");
});

// -------------------------------------------
// Start the Server with Bun
// -------------------------------------------
(async () => {
  await createMediasoupWorker();
  httpServer.listen(3001, () => {
    logger("info", "Server listening on http://localhost:3001");
  });
})();
