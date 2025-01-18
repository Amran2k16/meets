"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import io, { Socket } from "socket.io-client";

import mediasoupClient from "mediasoup-client";

import { SOCKET_EVENTS, type ServerMessageData } from "shared";
import { log } from "console";

export default function SocketPage() {
  const socketRef = useRef<Socket>(null);
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

      socketRef.current = io(SERVER_URL, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socketRef.current.on(SOCKET_EVENTS.CONNECT, () => {
        if (socketRef.current) {
          console.log(`Socket connected with ID: ${socketRef.current.id}`);
          joinRoom(extractedId);
        }

        socketRef.current?.on(SOCKET_EVENTS.NEW_PRODUCER, handleNewProducer);
      });

      socketRef.current.on(SOCKET_EVENTS.CONNECT, handleConnect);
      socketRef.current.on(SOCKET_EVENTS.CONNECT_ERROR, handleConnectError);
      socketRef.current.on(SOCKET_EVENTS.DISCONNECT, handleDisconnect);
      socketRef.current.on(SOCKET_EVENTS.SERVER_MESSAGE, handleServerMessage);

      return () => {
        if (socketRef.current) {
          socketRef.current.off(SOCKET_EVENTS.CONNECT, handleConnect);
          socketRef.current.off(SOCKET_EVENTS.DISCONNECT, handleDisconnect);
          socketRef.current.off(SOCKET_EVENTS.SERVER_MESSAGE, handleServerMessage);
          socketRef.current.disconnect();
          console.log("Disconnected from the WebSocket server");
        }

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

  const joinRoom = async (roomId: string) => {
    console.log(`Joining room with ID: ${roomId}`);

    // Join the room and wait for acknowledgment from the server
    const joinRoomResponse = await new Promise((resolve, reject) => {
      socketRef.current?.emit(
        SOCKET_EVENTS.JOIN_ROOM,
        { roomId },
        (response: { success: boolean; message: string }) => {
          if (response?.success) {
            console.log(`Successfully joined room: ${roomId}`);
            resolve(response);
          } else {
            console.error(`Failed to join room: ${response?.message}`);
            reject(new Error(response?.message || "Unknown error"));
          }
        }
      );
    });

    console.log("Room join response:", joinRoomResponse);

    // Retrieve RTP capabilities from the server
    const rtpCapabilities = await new Promise((resolve, reject) => {
      console.log("Requesting RTP capabilities from server...");
      console.log("Room ID:", roomId);
      socketRef.current?.emit("getRouterRtpCapabilities", { roomId }, (response: any) => {
        if (response?.error) {
          console.error("Failed to retrieve RTP capabilities:", response.error);
          reject(new Error(response.error));
        } else {
          console.log("RTP Capabilities received from server:", response);
          resolve(response);
        }
      });
    });

    console.log("RTP Capabilities received from server:", rtpCapabilities);

    // Initialize the mediasoup Device
    deviceRef.current = new mediasoupClient.Device();
    await deviceRef.current.load({ routerRtpCapabilities: rtpCapabilities });

    console.log("Mediasoup Device loaded");

    // Create transports
    await createSendTransport(roomId);
    await createRecvTransport(roomId);
  };

  // Create a send transport for producing media
  const createSendTransport = async (roomId: string) => {
    console.log("Creating send transport for producing media");
    const transportParams = await new Promise((resolve) => {
      socketRef.current?.emit("createTransport", { roomId, direction: "send" }, resolve);
    });

    sendTransportRef.current = deviceRef.current.createSendTransport(transportParams);

    sendTransportRef.current.on("connect", ({ dtlsParameters }, callback, errback) => {
      socketRef.current?.emit(
        "connectTransport",
        { transportId: sendTransportRef.current.id, dtlsParameters },
        callback
      );
    });

    sendTransportRef.current.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
      const producerId = await new Promise((resolve) => {
        socketRef.current?.emit("produce", { transportId: sendTransportRef.current.id, kind, rtpParameters }, resolve);
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
  const createRecvTransport = async (roomId: string) => {
    const transportParams = await new Promise((resolve) => {
      socketRef.current?.emit("createTransport", { roomId, direction: "recv" }, resolve);
    });

    recvTransportRef.current = deviceRef.current.createRecvTransport(transportParams);

    recvTransportRef.current.on("connect", ({ dtlsParameters }, callback, errback) => {
      socketRef.current?.emit(
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
      socketRef.current?.emit("consume", { producerId, transportId: recvTransportRef.current.id }, resolve);
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
    <div className="flex flex-col items-center space-y-4">
      <h1 className="text-xl font-bold">Room: {id}</h1>
      <div className={`text-lg ${connected ? "text-green-500" : "text-red-500"}`}>{connectMessage}</div>
      {/* Local Video */}
      <video
        autoPlay
        muted
        playsInline
        ref={(video) => {
          if (video && localStream) {
            video.srcObject = localStream;
          }
        }}
        className="w-1/2"
      />

      {/* Remote Videos */}
      <div className="flex space-x-4">
        {Object.entries(remoteStreams).map(([producerId, stream]) => (
          <video
            key={producerId}
            autoPlay
            playsInline
            ref={(video) => {
              if (video) {
                video.srcObject = stream;
              }
            }}
            className="w-1/4"
          />
        ))}
      </div>
    </div>
  );
}
