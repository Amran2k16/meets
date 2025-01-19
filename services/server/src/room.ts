import mediasoup, { type types } from "mediasoup";

export class Room {
  constructor(router: types.Router) {
    this.router = router;

    this.transports = new Map<string, Map<string, types.WebRtcTransport>>(); // Key: socketId, Value: Map of Transports
    this.producers = new Map<string, Map<string, types.Producer>>(); // Key: socketId, Value: Map of Producers
    this.consumers = new Map<string, Map<string, types.Consumer>>(); // Key: socketId, Value: Map of Consumers
  }

  public router: types.Router;
  public transports: Map<string, Map<string, types.WebRtcTransport>>;
  public producers: Map<string, Map<string, types.Producer>>;
  public consumers: Map<string, Map<string, types.Consumer>>;
}
