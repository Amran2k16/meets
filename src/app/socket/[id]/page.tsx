"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import io from "socket.io-client";

import { SOCKET_EVENTS, type ServerMessageData } from "shared";

export default function SocketPage() {
  const socketRef = useRef<any>(null);
  const deviceRef = useRef<any>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  const SERVER_URL = "http://localhost:3001";
  const path = usePathname();
  const [id, setId] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectMessage, setConnectMessage] = useState("");

  useEffect(() => {
    const initializeSocketConnection = async () => {
      try {
        const response = await fetch(SERVER_URL + "/");
        const data = await response.text();
        console.log("HTTP GET RESPONSE :", data);
      } catch (error) {
        console.error("Error fetching data from server:", error);

        handleFetchError();
      }
      // Extract the ID from the dynamic route
      const pathParts = path.split("/");
      const extractedId = pathParts[pathParts.length - 1]; // The last part of the path
      setId(extractedId);

      const socket = io(SERVER_URL, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socket.on(SOCKET_EVENTS.CONNECT, () => {
        console.log(`Socket connected with ID: ${socket.id}`);
      });

      socket.on(SOCKET_EVENTS.CONNECT, handleConnect);
      socket.on(SOCKET_EVENTS.CONNECT_ERROR, handleConnectError);
      socket.on(SOCKET_EVENTS.DISCONNECT, handleDisconnect);
      socket.on(SOCKET_EVENTS.SERVER_MESSAGE, handleServerMessage);

      return () => {
        socket.off(SOCKET_EVENTS.CONNECT, handleConnect);
        socket.off(SOCKET_EVENTS.DISCONNECT, handleDisconnect);
        socket.off(SOCKET_EVENTS.SERVER_MESSAGE, handleServerMessage);
        socket.disconnect();
        console.log("Disconnected from the WebSocket server");
      };
    };

    initializeSocketConnection();
  }, [path]);

  const handleFetchError = () => {
    setConnected(false);
    setConnectMessage("Failed to get response from HTTP Server");
    setLoading(false);
  };

  const handleConnectError = () => {
    console.error("Connection to WebSocket server failed");
    setConnected(false);
    setConnectMessage("Failed To Connect To Server");
    setLoading(false);
  };

  const handleConnect = () => {
    console.log("Connected to the WebSocket server");
    setConnected(true);
    setConnectMessage("Connected To Server");
    setLoading(false);
  };

  const handleDisconnect = (reason: string) => {
    console.log(`Disconnected from the WebSocket server. Reason: ${reason}`);
    setConnected(false);
    setConnectMessage("Disconnected from server");
  };

  const handleServerMessage = (data: ServerMessageData) => {
    console.log("Received welcome message from server:", data.message);
  };

  // Join the room
  const joinRoom = async () => {
    socketRef.current.emit("joinRoom", { roomId });

    // Load mediasoup Device with RTP Capabilities from server
    const rtpCapabilities = await new Promise((resolve) => {
      socketRef.current.emit("getRouterRtpCapabilities", {}, resolve);
    });

    deviceRef.current = new mediasoupClient.Device();
    await deviceRef.current.load({ routerRtpCapabilities: rtpCapabilities });

    console.log("Mediasoup Device loaded");

    // Create transports
    await createSendTransport();
    await createRecvTransport();
  };

  // Create a send transport for producing media
  const createSendTransport = async () => {
    const transportParams = await new Promise((resolve) => {
      socketRef.current.emit("createTransport", { direction: "send" }, resolve);
    });

    sendTransportRef.current = deviceRef.current.createSendTransport(transportParams);

    sendTransportRef.current.on("connect", ({ dtlsParameters }, callback, errback) => {
      socketRef.current.emit(
        "connectTransport",
        { transportId: sendTransportRef.current.id, dtlsParameters },
        callback
      );
    });

    sendTransportRef.current.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
      const producerId = await new Promise((resolve) => {
        socketRef.current.emit("produce", { transportId: sendTransportRef.current.id, kind, rtpParameters }, resolve);
      });
      callback({ id: producerId });
    });

    sendTransportRef.current.on("connectionstatechange", (state) => {
      console.log(`Send transport state: ${state}`);
    });

    // Start producing media (e.g., video, audio)
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);

    stream.getTracks().forEach(async (track) => {
      await sendTransportRef.current.produce({ track });
    });
  };

  // Create a recv transport for consuming media
  const createRecvTransport = async () => {
    const transportParams = await new Promise((resolve) => {
      socketRef.current.emit("createTransport", { direction: "recv" }, resolve);
    });

    recvTransportRef.current = deviceRef.current.createRecvTransport(transportParams);

    recvTransportRef.current.on("connect", ({ dtlsParameters }, callback, errback) => {
      socketRef.current.emit(
        "connectTransport",
        { transportId: recvTransportRef.current.id, dtlsParameters },
        callback
      );
    });

    recvTransportRef.current.on("connectionstatechange", (state) => {
      console.log(`Recv transport state: ${state}`);
    });
  };

  // Handle new producer
  const handleNewProducer = async ({ producerId }: { producerId: string }) => {
    const consumerParameters = await new Promise((resolve) => {
      socketRef.current.emit("consume", { producerId, transportId: recvTransportRef.current.id }, resolve);
    });

    const consumer = await recvTransportRef.current.consume(consumerParameters);

    const stream = new MediaStream([consumer.track]);
    setRemoteStreams((prev) => ({ ...prev, [producerId]: stream }));

    consumer.on("trackended", () => {
      setRemoteStreams((prev) => {
        const updated = { ...prev };
        delete updated[producerId];
        return updated;
      });
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <div className="text-xl font-bold">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
      <div className="text-xl font-bold">Room ID: {id}</div>
      <div className={`text-lg ${connected ? "text-green-500" : "text-red-500"}`}>{connectMessage}</div>
    </div>
  );
}
