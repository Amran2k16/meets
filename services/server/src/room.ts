import mediasoup, { types } from "mediasoup";

export class Room {
  constructor(router: types.Router) {
    this.router = router;
    this.transports = new Map<string, types.Transport>(); // Key: socketId, Value: Transport
    this.producers = new Map<string, types.Producer>(); // Key: socketId, Value: Producer
    this.consumers = new Map<string, types.Consumer[]>(); // Key: socketId, Value: Array of Consumers
  }

  public router: types.Router;
  public transports: Map<string, types.Transport>;
  public producers: Map<string, types.Producer>;
  public consumers: Map<string, types.Consumer[]>;
}
