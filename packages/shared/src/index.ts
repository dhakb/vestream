// Common interfaces used between frontend and backend
export interface User {
  id: string;
  username: string;
  email: string;
}

export interface Message {
  id: string;
  userId: string;
  content: string;
  timestamp: string;
}

// WebSocket message types
export type WSMessageType = 'MESSAGE' | 'USER_STATUS' | 'ERROR';

export interface WSMessage {
  type: WSMessageType;
  payload: unknown;
  timestamp: string;
} 