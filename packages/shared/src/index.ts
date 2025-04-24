// Common interfaces used between frontend and backend
export interface User {
  id: string;
  username: string;
  role: 'broadcaster' | 'viewer';
  roomId: string;
}

export interface Room {
  id: string;
  name: string;
  broadcaster?: string; // userId of the broadcaster
  viewers: string[]; // array of viewer userIds
}

// WebSocket message types
export type WSMessageType =
  | 'JOIN_ROOM'
  | 'LEAVE_ROOM'
  | 'ROOM_JOINED'
  | 'ROOM_STATE'
  | 'OFFER'
  | 'ANSWER'
  | 'ICE_CANDIDATE'
  | 'USER_JOINED'
  | 'USER_LEFT'
  | 'ERROR'
  | 'STREAM_READY'
  | 'VIEWER_READY'
  | 'BROADCASTER_READY';

export interface WSMessage {
  type: WSMessageType;
  payload: unknown;
  timestamp: string;
}

// WebRTC signaling message payloads
export interface JoinRoomPayload {
  roomId: string;
  username: string;
  role: 'broadcaster' | 'viewer';
}

export interface RoomJoinedPayload {
  room: Room;
  user: User;
}

export interface RoomStatePayload {
  room: Room;
}

export interface UserJoinedPayload {
  user: User;
}

export interface UserLeftPayload {
  user: User;
  room: Room;
}

export interface RTCSignalPayload {
  sender: string;
  receiver: string;
  roomId: string;
  data: any; // RTCSessionDescription or RTCIceCandidate
}

export interface BroadcasterReadyPayload {
  broadcaster: User;
}

export interface ViewerReadyPayload {
  viewer: User;
}

export interface ErrorPayload {
  code: 'ROOM_NOT_FOUND' | 'BROADCASTER_EXISTS' | 'USER_EXISTS' | 'INVALID_ROLE';
  message: string;
} 