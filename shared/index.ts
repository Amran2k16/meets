import { type types as mediaSoupTypes } from "mediasoup";

export const SOCKET_EVENTS = {
  CONNECT: "connect",
  CONNECT_ERROR: "connectError",
  DISCONNECT: "disconnect",
  SERVER_MESSAGE: "serverMessage",

  // Room actions
  JOIN_ROOM: "joinRoom",
  LEAVE_ROOM: "leaveRoom",

  // Media actions
  CREATE_TRANSPORT: "createTransport",
  CONNECT_TRANSPORT: "connectTransport",
  PRODUCE: "produce",
  CONSUME: "consume",
  NEW_PRODUCER: "newProducer",
  GET_ROUTER_CAPABILITIES: "getRouterRtpCapabilities",

  // (These below aren’t used yet in your code but are defined)
  MUTE_MIC: "muteMic",
  MUTE_VIDEO: "muteVideo",
  SEND_ROOM_MESSAGE: "sendRoomMessage",
  ROOM_MESSAGE: "roomMessage",
};

export const TRANSPORT_EVENTS = {
  CONNECTION_STATE_CHANGE: "connectionstatechange",
};

export type ServerMessageData = { message: string };
export type JoinRoomEventData = { id: string; name: string; roomName: string };
export type SendRoomMessageData = { roomName: string; message: string };
export type RoomMessageData = { roomName: string; message: string };
export type LeaveRoomData = { roomName: string };

export type ConsumeResponse = {
  success: boolean;
  consumerParams?: {
    id: string;
    producerId: string;
    kind: string;
    rtpParameters: any;
    type: string;
    appData: any;
  };
  error?: string;
};

export type SocketResponse<T> = (response: { success: boolean; message?: string; data?: T | null }) => void;

export type TransportData = {
  id: string;
  iceParameters: mediaSoupTypes.IceParameters;
  iceCandidates: mediaSoupTypes.IceCandidate[];
  dtlsParameters: mediaSoupTypes.DtlsParameters;
  sctpParameters?: mediaSoupTypes.SctpParameters;
};

export type ConsumerData = {
  id: string;
  producerId: string;
  kind: string;
  rtpParameters: mediaSoupTypes.RtpParameters;
  type: string;
};
