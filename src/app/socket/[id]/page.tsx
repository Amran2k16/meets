// app/page.tsx
"use client";

import { Consumer, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import io, { Socket } from "socket.io-client";
import mediasoupClient, { type types as mediaSoupTypes } from "mediasoup-client";

import {
  ConsumerData,
  ConsumeResponse,
  JoinRoomResponse,
  SOCKET_EVENTS,
  TRANSPORT_EVENTS,
  TransportData,
  type ServerMessageData,
} from "shared"; // adjust path as needed
import { emitAsync, safeEmitAsync } from "@/lib/utils";

export default function SocketPage() {
  /********************************************************
   * Events This Client Emits to the Server
   * ------------------------------------------------------
   * 1) SOCKET_EVENTS.JOIN_ROOM
   * 2) SOCKET_EVENTS.GET_ROUTER_CAPABILITIES
   * 3) SOCKET_EVENTS.CREATE_TRANSPORT
   * 4) SOCKET_EVENTS.CONNECT_TRANSPORT
   * 5) SOCKET_EVENTS.PRODUCE
   * 6) SOCKET_EVENTS.CONSUME
   *
   * Events This Client Listens for from the Server
   * ------------------------------------------------------
   * 1) SOCKET_EVENTS.CONNECT
   * 2) SOCKET_EVENTS.CONNECT_ERROR
   * 3) SOCKET_EVENTS.DISCONNECT
   * 4) SOCKET_EVENTS.SERVER_MESSAGE
   * 5) SOCKET_EVENTS.NEW_PRODUCER
   ********************************************************/

  const socketRef = useRef<Socket | null>(null);
  const deviceRef = useRef<mediasoupClient.Device | null>(null);
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
        // Basic test to check if server is alive
        const response = await fetch(SERVER_URL + "/");
        const data = await response.text();
        console.log("HTTP GET RESPONSE:", data);
      } catch (error) {
        console.error("Error fetching data from server:", error);
        handleFetchError();
      }

      // Extract the ID from the dynamic route
      const pathParts = path.split("/");
      const extractedId = pathParts[pathParts.length - 1];
      setId(extractedId);

      // Connect to socket
      socketRef.current = io(SERVER_URL, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      // ===================
      // Set up Listeners
      // ===================
      if (socketRef.current) {
        const s = socketRef.current;

        // Fired upon successful connection
        s.on(SOCKET_EVENTS.CONNECT, async () => {
          console.log(`Socket connected with ID: ${s.id}`);

          setConnected(true);
          setConnectMessage("Connected To Server");
          setLoading(false);

          const roomId = extractedId;
          console.log(`Joining room with ID: ${roomId}`);

          if (!socketRef.current) return;

          const [joinRoomError, producersList] = await safeEmitAsync<string[]>(
            socketRef.current,
            SOCKET_EVENTS.JOIN_ROOM,
            {
              roomId,
            }
          );

          if (joinRoomError) {
            console.error("Failed to join room:", joinRoomError.message);
            return;
          }

          // 2) Get Router RTP Capabilities
          console.log("Requesting RTP capabilities from server...");
          const [rtpError, rtpCapabilitiesResponse] = await safeEmitAsync<mediaSoupTypes.RtpCapabilities>(
            socketRef.current,
            SOCKET_EVENTS.GET_ROUTER_CAPABILITIES,
            { roomId }
          );

          if (rtpError) {
            console.error("Failed to retrieve RTP capabilities:", rtpError);
            return;
          }

          console.log("RTP Capabilities received from server:", rtpCapabilitiesResponse);

          // 3) Create Mediasoup Device
          deviceRef.current = new mediasoupClient.Device();
          await deviceRef.current.load({ routerRtpCapabilities: rtpCapabilitiesResponse! });
          console.log("Mediasoup Device loaded");

          console.log("Requesting to create transport for sending media...");

          //CREATE SEND TRANSPORT
          const [createSendTransportError, createSendTransportResponse] = await safeEmitAsync<TransportData>(
            socketRef.current,
            SOCKET_EVENTS.CREATE_TRANSPORT,
            { roomId, direction: "send" }
          );

          console.log("Create Send Transport Response:", createSendTransportResponse);

          if (createSendTransportError) {
            console.error("Failed to create transport:", createSendTransportError.message);
            return;
          }

          console.log("Transport Parameters:", JSON.stringify(createSendTransportResponse?.id));

          sendTransportRef.current = deviceRef.current.createSendTransport(createSendTransportResponse!);

          sendTransportRef.current.on(
            "connect",
            async ({ dtlsParameters }: any, callback: () => void, errback: (error: Error) => void) => {
              console.log("SendTransport connecting...");
              const [connectError, connectResponse] = await safeEmitAsync<any>(
                socketRef.current!,
                SOCKET_EVENTS.CONNECT_TRANSPORT,
                { roomId, transportId: sendTransportRef.current.id, dtlsParameters }
              );

              if (connectError) {
                errback(new Error(connectError.message));
              } else {
                callback();
              }
            }
          );

          sendTransportRef.current.on(
            "produce",
            async (
              { kind, rtpParameters }: any,
              callback: (arg: { id: string }) => void,
              errback: (error: Error) => void
            ) => {
              if (!socketRef.current) return;

              const [produceError, produceResponse] = await safeEmitAsync<any>(
                socketRef.current,
                SOCKET_EVENTS.PRODUCE,
                {
                  roomId,
                  transportId: sendTransportRef.current.id,
                  kind,
                  rtpParameters,
                }
              );

              if (produceError) {
                errback(new Error(produceError.message));
              } else {
                callback({ id: produceResponse.id });
              }
            }
          );

          sendTransportRef.current.on(TRANSPORT_EVENTS.CONNECTION_STATE_CHANGE, (state: string) => {
            console.log(`Send transport state changed: ${state}`);
          });

          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          setLocalStream(stream);

          stream.getTracks().forEach(async (track) => {
            await sendTransportRef.current.produce({ track });
          });

          //
          //  CREATE RECEIVE TRANSPORT
          //
          const [createRecvTransportError, createRecvTransportResponse] = await safeEmitAsync<TransportData>(
            socketRef.current,
            SOCKET_EVENTS.CREATE_TRANSPORT,
            { roomId, direction: "recv" }
          );

          if (createRecvTransportError) {
            throw new Error(createRecvTransportError.message);
          }

          recvTransportRef.current = deviceRef.current.createRecvTransport(createRecvTransportResponse!);

          recvTransportRef.current.on(
            "connect",
            async ({ dtlsParameters }: any, callback: () => void, errback: (error: Error) => void) => {
              console.log("RecvTransport connecting...");

              const [connectTransportError, connectTransportResponse] = await safeEmitAsync<any>(
                socketRef.current!,
                SOCKET_EVENTS.CONNECT_TRANSPORT,
                { roomId, transportId: recvTransportRef.current.id, dtlsParameters }
              );

              if (connectTransportError) {
                errback(new Error(connectTransportResponse.error));
              } else {
                callback();
              }
            }
          );

          recvTransportRef.current.on(TRANSPORT_EVENTS.CONNECTION_STATE_CHANGE, (state: string) => {
            console.log(`Recv transport state changed: ${state}`);
          });

          console.log("Join Room Response -> List of producers:", JSON.stringify(producersList));

          for (const producerId of producersList!) {
            if (producerId === sendTransportRef.current.id) {
              console.log(`Skipping own producer with ID: ${producerId}`);
              continue;
            }

            const [consumeError, consumeResult] = await safeEmitAsync<ConsumerData>(
              socketRef.current,
              SOCKET_EVENTS.CONSUME,
              {
                roomId,
                producerId,
                transportId: recvTransportRef.current.id,
              }
            );

            if (consumeError) {
              console.error("Failed to join room:", consumeError.message);
              return;
            }

            // Now create a consumer for that existing producer
            const consumer = await recvTransportRef.current.consume(consumeResult);
            const stream = new MediaStream([consumer.track]);
            setRemoteStreams((prev) => ({ ...prev, [producerId]: stream }));

            consumer.on("trackended", () => {
              console.log(`Remote track ended for producer: ${producerId}`);
              setRemoteStreams((prev) => {
                const updated = { ...prev };
                delete updated[producerId];
                return updated;
              });
            });
          }
        });

        s.on(SOCKET_EVENTS.CONNECT_ERROR, handleConnectError);
        s.on(SOCKET_EVENTS.DISCONNECT, handleDisconnect);
        s.on(SOCKET_EVENTS.SERVER_MESSAGE, handleServerMessage);

        // Fired when server notifies about a new producer
        s.on(SOCKET_EVENTS.NEW_PRODUCER, handleNewProducer);
      }

      return () => {
        if (socketRef.current) {
          const s = socketRef.current;
          s.off(SOCKET_EVENTS.CONNECT, handleConnect);
          s.off(SOCKET_EVENTS.CONNECT_ERROR, handleConnectError);
          s.off(SOCKET_EVENTS.DISCONNECT, handleDisconnect);
          s.off(SOCKET_EVENTS.SERVER_MESSAGE, handleServerMessage);
          s.off(SOCKET_EVENTS.NEW_PRODUCER, handleNewProducer);

          // Disconnect
          s.disconnect();
          console.log("Disconnected from the WebSocket server");
        }
      };
    };

    initializeSocketConnection();
  }, [path]);

  // ================================================
  // Handler Functions for Socket Connection
  // ================================================
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

  const handleConnect = () => {};

  const handleDisconnect = (reason: string) => {
    console.log(`Disconnected from the WebSocket server. Reason: ${reason}`);
    setConnected(false);
    setConnectMessage("Disconnected from server");
  };

  const handleServerMessage = (data: ServerMessageData) => {
    console.log("Received server message:", data.message);
  };

  // ================================================
  // Handle a new producer (i.e., someone else joined)
  // ================================================
  const handleNewProducer = async ({ producerId }: { producerId: string }) => {
    console.log(`Handling new producer from server: ${producerId}`);

    console.log("Sending consume request to server with:", {
      roomId: path.split("/").pop() || "",
      producerId,
      transportId: recvTransportRef.current.id,
    });

    const [consumeError, consumerParameters] = await safeEmitAsync<mediaSoupTypes.Consumer>(
      socketRef.current!,
      SOCKET_EVENTS.CONSUME,
      {
        roomId: path.split("/").pop() || "", // dynamically extract the latest id from the path
        producerId,
        transportId: recvTransportRef.current.id,
      }
    );

    if (consumeError) {
      console.error("Error consuming producer:", consumeError.message);
      return;
    }

    console.log("Consumer parameters:", JSON.stringify(consumerParameters));

    // Create a new consumer
    const consumer = await recvTransportRef.current.consume(consumerParameters);
    console.log(`Consumer created for producer: ${producerId}`);

    // Attach the consumer track to a new MediaStream
    const stream = new MediaStream([consumer.track]);
    setRemoteStreams((prev) => ({ ...prev, [producerId]: stream }));

    // Clean up on track end
    consumer.on("trackended", () => {
      console.log(`Remote track ended for producer: ${producerId}`);
      setRemoteStreams((prev) => {
        const updated = { ...prev };
        delete updated[producerId];
        return updated;
      });
    });
  };

  // ================================================
  // Render
  // ================================================
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
