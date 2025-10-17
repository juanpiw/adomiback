import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export function setSocketServer(server: SocketIOServer) {
  io = server;
}

export function getSocketServer(): SocketIOServer | null {
  return io;
}

export function emitToConversation(conversationId: number | string, event: string, payload: any) {
  if (!io) return;
  const room = `conversation:${conversationId}`;
  io.to(room).emit(event, payload);
}

export function emitToUser(userId: number | string, event: string, payload: any) {
  if (!io) return;
  const room = `user:${userId}`;
  io.to(room).emit(event, payload);
}


