'use strict';
const EventEmitter = require('events').EventEmitter;

const MAX_ERIZOS_PER_ROOM = 100;

class ErizoList extends EventEmitter {
  constructor(maxErizos = MAX_ERIZOS_PER_ROOM) {
    super();
    this.maxErizos = maxErizos;
    this.erizos = new Array(maxErizos);
    this.erizos.fill(1);
    this.erizos = this.erizos.map(() => {
      return {
        pending: false,
        erizoId: undefined,
        agentId: undefined,
        erizoIdForAgent: undefined,
        publishers: [],
        kaCount: 0,
      };
    });
  }

  findById(erizoId) {
    return this.erizos.find((erizo) => {
      return erizo.erizoId === erizoId;
    });
  }

  onErizoReceived(position, callback) {
    this.on(this.getInternalPosition(position), callback);
  }

  getInternalPosition(position) {
    return position % this.maxErizos;
  }

  isPending(position) {
    return this.erizos[this.getInternalPosition(position)].pending;
  }

  get(position) {
    return this.erizos[this.getInternalPosition(position)];
  }

  forEachExisting(task) {
    this.erizos.forEach((erizo) => {
      if (erizo.erizoId) {
        task(erizo);
      }
    });
  }

  deleteById(erizoId) {
    const erizo = this.findById(erizoId);
    erizo.pending = false;
    erizo.erizoId = undefined;
    erizo.agentId = undefined;
    erizo.erizoIdForAgent = undefined;
    erizo.publishers = [];
    erizo.kaCount = 0;
  }

  markAsPending(position) {
    this.erizos[this.getInternalPosition(position)].pending = true;
  }

  set(position, erizoId, agentId, erizoIdForAgent) {
    const erizo = this.erizos[this.getInternalPosition(position)];
    erizo.pending = false;
    erizo.erizoId = erizoId;
    erizo.agentId = agentId;
    erizo.erizoIdForAgent = erizoIdForAgent;
    this.emit(position, erizo);
  }
}

exports.ErizoList = ErizoList;
