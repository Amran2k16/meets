import mediasoup, { types } from "mediasoup";

export class Room {
  constructor(router: types.Router) {
    this.router = router;
    this.transports = new Map<string, types.Transport>(); // Key: socketId, Value: Transport
    this.producers = new Map<string, types.Producer>(); // Key: socketId, Value: Producer
    this.consumers = new Map<string, types.Consumer[]>(); // Key: socketId, Value: Array of Consumers
  }

  private router: types.Router;
  private transports: Map<string, types.Transport>;
  private producers: Map<string, types.Producer>;
  private consumers: Map<string, types.Consumer[]>;
}
