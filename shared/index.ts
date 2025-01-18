export const SOCKET_EVENTS = {
  CONNECT: "connect",
  CONNECT_ERROR: "connectError",
  DISCONNECT: "disconnect",
  SERVER_MESSAGE: "serverMessage",
  JOIN_ROOM: "joinRoom",
  LEAVE_ROOM: "leaveRoom",
  MUTE_MIC: "muteMic",
  MUTE_VIDEO: "muteVideo",
  SEND_ROOM_MESSAGE: "sendRoomMessage",
  ROOM_MESSAGE: "roomMessage",
  CREATE_TRANSPORT: "createTransport",
  CONSUME: "consume",
  PRODUCE: "produce",
  NEW_PRODUCER: "newProducer",
  GET_ROUTER_CAPABILITIES: "getRouterRtpCapabilities",
};

export type ServerMessageData = { message: string };
export type JoinRoomEventData = { id: string; name: string; roomName: string };
export type SendRoomMessageData = { roomName: string; message: string };
export type RoomMessageData = { roomName: string; message: string };
export type LeaveRoomData = { roomName: string };
