// app/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import io, { Socket } from "socket.io-client";
import mediasoupClient from "mediasoup-client";

import { SOCKET_EVENTS, type ServerMessageData } from "shared"; // adjust path as needed

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
        s.on(SOCKET_EVENTS.CONNECT, () => {
          console.log(`Socket connected with ID: ${s.id}`);
          handleConnect();

          // Join the room after we have a socket connection
          joinRoom(extractedId);
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
    console.log("Received server message:", data.message);
  };

  // ================================================
  // Join Room and Setup Mediasoup
  // ================================================
  const joinRoom = async (roomId: string) => {
    console.log(`Joining room with ID: ${roomId}`);

    if (!socketRef.current) return;

    // 1) Request to join the room
    const joinRoomResponse = await new Promise<{
      success: boolean;
      message: string;
      existingProducerIds: string[];
    }>((resolve, reject) => {
      socketRef.current?.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId }, (response: any) => {
        if (response?.success) {
          console.log(`Successfully joined room: ${roomId}`);
          resolve(response);
        } else {
          console.error(`Failed to join room: ${response?.message}`);
          reject(new Error(response?.message || "Unknown error"));
        }
      });
    });

    // 2) Check for existing producers
    if (joinRoomResponse.existingProducerIds.length > 0) {
      console.log("Found existing producers:", joinRoomResponse.existingProducerIds);
      await consumeExistingProducers(joinRoomResponse.existingProducerIds, roomId);
    }

    // 2) Get Router RTP Capabilities
    const rtpCapabilities = await new Promise<any>((resolve, reject) => {
      console.log("Requesting RTP capabilities from server...");
      socketRef.current?.emit(SOCKET_EVENTS.GET_ROUTER_CAPABILITIES, { roomId }, (response: any) => {
        if (response?.error) {
          console.error("Failed to retrieve RTP capabilities:", response.error);
          reject(new Error(response.error));
        } else {
          console.log("RTP Capabilities received from server:", response);
          resolve(response);
        }
      });
    });

    // 3) Create Mediasoup Device
    deviceRef.current = new mediasoupClient.Device();
    await deviceRef.current.load({ routerRtpCapabilities: rtpCapabilities });
    console.log("Mediasoup Device loaded");

    // 4) Create send and receive transports
    await createSendTransport(roomId);
    await createRecvTransport(roomId);
  };

  async function consumeExistingProducers(producerIds: string[], roomId: string) {
    if (!recvTransportRef.current || !socketRef.current) return;

    for (const producerId of producerIds) {
      try {
        const consumerParams = await new Promise<any>((resolve, reject) => {
          socketRef.current?.emit(
            SOCKET_EVENTS.CONSUME,
            {
              roomId,
              producerId,
              transportId: recvTransportRef.current.id,
            },
            (response: any) => {
              if (response.error) {
                reject(new Error(response.error));
              } else {
                resolve(response);
              }
            }
          );
        });

        // Now create a consumer for that existing producer
        const consumer = await recvTransportRef.current.consume(consumerParams);
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
      } catch (error) {
        console.error(`Error consuming existing producer ${producerId}:`, error);
      }
    }
  }
  // ================================================
  // Create Send Transport
  // ================================================
  const createSendTransport = async (roomId: string) => {
    if (!socketRef.current || !deviceRef.current) return;

    // 1) Request transport parameters from server
    const transportParams = await new Promise<any>((resolve) => {
      socketRef.current?.emit(SOCKET_EVENTS.CREATE_TRANSPORT, { roomId, direction: "send" }, resolve);
    });

    // 2) Create a local send transport in the client
    sendTransportRef.current = deviceRef.current.createSendTransport(transportParams);

    // 3) Transport event handlers
    sendTransportRef.current.on(
      "connect",
      ({ dtlsParameters }: any, callback: () => void, errback: (error: Error) => void) => {
        console.log("SendTransport connecting...");
        socketRef.current?.emit(
          SOCKET_EVENTS.CONNECT_TRANSPORT,
          { transportId: sendTransportRef.current.id, dtlsParameters },
          (response: any) => {
            if (response?.error) {
              errback(new Error(response.error));
            } else {
              callback();
            }
          }
        );
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

        socketRef.current.emit(
          SOCKET_EVENTS.PRODUCE,
          {
            roomId,
            transportId: sendTransportRef.current.id,
            kind,
            rtpParameters,
          },
          (response: any) => {
            if (response?.error) {
              errback(new Error(response.error));
            } else {
              callback({ id: response.id });
            }
          }
        );
      }
    );

    sendTransportRef.current.on("connectionstatechange", (state: string) => {
      console.log(`Send transport state changed: ${state}`);
    });

    // 4) Capture local media and produce
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);

    stream.getTracks().forEach(async (track) => {
      await sendTransportRef.current.produce({ track });
    });
  };

  // ================================================
  // Create Receive Transport
  // ================================================
  const createRecvTransport = async (roomId: string) => {
    if (!socketRef.current || !deviceRef.current) return;

    // 1) Request transport params from server
    const transportParams = await new Promise<any>((resolve) => {
      socketRef.current?.emit(SOCKET_EVENTS.CREATE_TRANSPORT, { roomId, direction: "recv" }, resolve);
    });

    // 2) Create a local receive transport
    recvTransportRef.current = deviceRef.current.createRecvTransport(transportParams);

    // 3) Transport event handlers
    recvTransportRef.current.on(
      "connect",
      ({ dtlsParameters }: any, callback: () => void, errback: (error: Error) => void) => {
        console.log("RecvTransport connecting...");
        socketRef.current?.emit(
          SOCKET_EVENTS.CONNECT_TRANSPORT,
          { transportId: recvTransportRef.current.id, dtlsParameters },
          (response: any) => {
            if (response?.error) {
              errback(new Error(response.error));
            } else {
              callback();
            }
          }
        );
      }
    );

    recvTransportRef.current.on("connectionstatechange", (state: string) => {
      console.log(`Recv transport state changed: ${state}`);
    });
  };

  // ================================================
  // Handle a new producer (i.e., someone else joined)
  // ================================================
  const handleNewProducer = async ({ producerId }: { producerId: string }) => {
    try {
      if (!socketRef.current || !recvTransportRef.current) return;

      console.log(`Handling new producer from server: ${producerId}`);

      const consumerParameters = await new Promise<any>((resolve, reject) => {
        socketRef.current?.emit(
          SOCKET_EVENTS.CONSUME,
          {
            roomId: path.split("/").pop() || "", // dynamically extract the latest id from the path
            producerId,
            transportId: recvTransportRef.current.id,
          },
          (response: any) => {
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response);
            }
          }
        );
      });

      console.log("Consumer parameters:", consumerParameters);

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
    } catch (error: any) {
      console.error(`Error handling new producer ${producerId}:`, error.message);
    }
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
