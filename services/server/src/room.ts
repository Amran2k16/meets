import mediasoup, { types } from "mediasoup";

export class Room {
  constructor(router: types.Router) {
    this.router = router;
    this.transports = new Map<string, Map<string, types.Transport>>(); // Key: socketId, Value: Map of Transports
    this.producers = new Map<string, Map<string, types.Producer>>(); // Key: socketId, Value: Map of Producers
    this.consumers = new Map<string, Map<string, types.Consumer>>(); // Key: socketId, Value: Map of Consumers
  }

  public router: types.Router;
  public transports: Map<string, Map<string, types.Transport>>;
  public producers: Map<string, Map<string, types.Producer>>;
  public consumers: Map<string, Map<string, types.Consumer>>;
}
