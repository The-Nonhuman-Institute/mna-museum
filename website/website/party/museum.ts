import type * as Party from "partykit/server";

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}
  onConnect(conn: Party.Connection) {
    conn.send(JSON.stringify({ type: "init", id: conn.id }));
  }
  onMessage(message: string, sender: Party.Connection) {
    this.room.broadcast(message, [sender.id]);
  }
}

Server satisfies Party.Worker;
