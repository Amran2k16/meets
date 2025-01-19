import mediasoup, { type types } from "mediasoup";

export class Room {
  constructor(router: types.Router) {
    this.router = router;
    this.transports = new Map<string, Map<string, types.WebRtcTransport>>();
    this.producers = new Map<string, Map<string, types.Producer>>();
    this.consumers = new Map<string, Map<string, types.Consumer>>();
  }

  public router: types.Router;
  private transports: Map<string, Map<string, types.WebRtcTransport>>;
  private producers: Map<string, Map<string, types.Producer>>;
  private consumers: Map<string, Map<string, types.Consumer>>;

  deleteAllEntriesForSocket(socketId: string) {
    const maps = [this.transports, this.producers, this.consumers];
    maps.forEach((map) => map.delete(socketId));
  }

  addTransport(socketId: string, transportId: string, transport: types.WebRtcTransport) {
    const transportsMap = this.transports.get(socketId) || new Map();
    transportsMap.set(transportId, transport);
    this.transports.set(socketId, transportsMap);
  }

  removeTransport(socketId: string, transportId: string) {
    const transportsMap = this.transports.get(socketId);
    if (transportsMap) {
      transportsMap.delete(transportId);
      if (transportsMap.size === 0) {
        this.transports.delete(socketId);
      }
    }
  }

  getAllTransports(socketId?: string): types.WebRtcTransport[] {
    if (socketId) {
      const transportsMap = this.transports.get(socketId);
      return transportsMap ? Array.from(transportsMap.values()) : [];
    }
    return Array.from(this.transports.values()).flatMap((map) => Array.from(map.values()));
  }

  addProducer(socketId: string, producerId: string, producer: types.Producer) {
    const producersMap = this.producers.get(socketId) || new Map();
    producersMap.set(producerId, producer);
    this.producers.set(socketId, producersMap);

    const totalProducers = Array.from(this.producers.values()).reduce((acc, map) => acc + map.size, 0);
    console.log(`Added producer with ID: ${producerId}, Type: ${producer.kind}, Total producers: ${totalProducers}`);
  }

  removeProducer(socketId: string, producerId: string) {
    this.producers.get(socketId)?.delete(producerId);
    if (this.producers.get(socketId)?.size === 0) {
      this.producers.delete(socketId);
    }
  }

  getAllProducers(socketId?: string): types.Producer[] {
    if (socketId) {
      const producersMap = this.producers.get(socketId);
      return producersMap ? Array.from(producersMap.values()) : [];
    }
    return Array.from(this.producers.values()).flatMap((map) => Array.from(map.values()));
  }

  addConsumer(socketId: string, consumerId: string, consumer: types.Consumer) {
    const consumersMap = this.consumers.get(socketId) || new Map();
    consumersMap.set(consumerId, consumer);
    this.consumers.set(socketId, consumersMap);
  }

  removeConsumer(socketId: string, consumerId: string) {
    const consumersMap = this.consumers.get(socketId);
    if (consumersMap) {
      consumersMap.delete(consumerId);
      if (consumersMap.size === 0) {
        this.consumers.delete(socketId);
      }
    }
  }

  getAllConsumers(socketId?: string): types.Consumer[] {
    if (socketId) {
      const consumersMap = this.consumers.get(socketId);
      return consumersMap ? Array.from(consumersMap.values()) : [];
    }
    return Array.from(this.consumers.values()).flatMap((map) => Array.from(map.values()));
  }
}
