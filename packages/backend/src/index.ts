import express from 'express';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import type {
  WSMessage,
  User,
  Room,
  JoinRoomPayload,
  RTCSignalPayload,
  RoomJoinedPayload,
  UserJoinedPayload,
  UserLeftPayload,
  RoomStatePayload,
  ErrorPayload,
  ChatMessage,
  ChatMessagePayload,
} from '@vestream/shared';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage
const rooms = new Map<string, Room>();
const users = new Map<string, User>();
const connections = new Map<string, WebSocket>();
const activeStreams = new Map<string, boolean>(); // roomId -> hasActiveStream
const chatMessages = new Map<string, ChatMessage[]>(); // roomId -> messages

// Helper function to send WebSocket messages
function sendMessage(ws: WebSocket, message: WSMessage) {
  ws.send(JSON.stringify(message));
}

function broadcastToRoom(roomId: string, message: WSMessage, excludeUser?: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  const userIds = [...(room.broadcaster ? [room.broadcaster] : []), ...room.viewers];
  userIds.forEach((userId) => {
    if (excludeUser && userId === excludeUser) return;
    const userWs = connections.get(userId);
    if (userWs) {
      sendMessage(userWs, message);
    }
  });
}

function isUsernameTaken(roomId: string, username: string): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;

  const usersInRoom = Array.from(users.values()).filter(user => user.roomId === roomId);
  return usersInRoom.some(user => user.username.toLowerCase() === username.toLowerCase());
}

// Helper to notify a new viewer about active broadcaster
function notifyViewerOfBroadcaster(roomId: string, viewerId: string) {
  const room = rooms.get(roomId);
  if (!room || !room.broadcaster) return;
  
  const broadcaster = users.get(room.broadcaster);
  const viewerWs = connections.get(viewerId);
  
  if (broadcaster && viewerWs) {
    console.log(`Notifying viewer ${viewerId} about broadcaster ${broadcaster.id} in room ${roomId}`);
    sendMessage(viewerWs, {
      type: 'BROADCASTER_READY',
      payload: {
        broadcaster: broadcaster,
      },
      timestamp: new Date().toISOString(),
    });
  }
}

// Helper function to get room with user details
function getRoomWithUsers(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return null;

  // Collect all users in the room
  const roomUsers: User[] = [];
  if (room.broadcaster) {
    const broadcaster = users.get(room.broadcaster);
    if (broadcaster) roomUsers.push(broadcaster);
  }
  
  room.viewers.forEach(viewerId => {
    const viewer = users.get(viewerId);
    if (viewer) roomUsers.push(viewer);
  });

  return {
    ...room,
    users: roomUsers
  };
}

// Function to get recent chat messages for a room
function getRoomMessages(roomId: string, limit = 50) {
  const messages = chatMessages.get(roomId) || [];
  return messages.slice(-limit); // Return only the most recent messages
}

// REST endpoints
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/rooms', (_req, res) => {
  res.json(Array.from(rooms.values()));
});

// Get chat messages for a room
app.get('/api/rooms/:roomId/messages', (req, res) => {
  const { roomId } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;
  
  const messages = getRoomMessages(roomId, limit);
  res.json(messages);
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  let currentUserId: string | undefined;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString()) as WSMessage;
      const timestamp = new Date().toISOString();

      switch (message.type) {
        case 'JOIN_ROOM': {
          const { roomId, username, role } = message.payload as JoinRoomPayload;
          const room = rooms.get(roomId);

          // Handle room creation for broadcaster
          if (!room) {
            if (role === 'viewer') {
              sendMessage(ws, {
                type: 'ERROR',
                payload: {
                  code: 'ROOM_NOT_FOUND',
                  message: 'Room does not exist',
                } as ErrorPayload,
                timestamp,
              });
              return;
            }

            // Create new room for broadcaster
            rooms.set(roomId, {
              id: roomId,
              name: `Room ${roomId}`,
              viewers: [],
            });
            
            // Initialize chat messages for this room
            chatMessages.set(roomId, []);
          } else {
            // Check if username is taken in existing room
            if (isUsernameTaken(roomId, username)) {
              sendMessage(ws, {
                type: 'ERROR',
                payload: {
                  code: 'USER_EXISTS',
                  message: 'Username is already taken in this room',
                } as ErrorPayload,
                timestamp,
              });
              return;
            }

            // Check if broadcaster exists when trying to join as broadcaster
            if (role === 'broadcaster' && room.broadcaster) {
              sendMessage(ws, {
                type: 'ERROR',
                payload: {
                  code: 'BROADCASTER_EXISTS',
                  message: 'Room already has a broadcaster',
                } as ErrorPayload,
                timestamp,
              });
              return;
            }
          }

          const newUserId = uuidv4();
          currentUserId = newUserId;
          const updatedRoom = rooms.get(roomId)!;

          const user: User = {
            id: newUserId,
            username,
            role,
            roomId,
          };

          // Handle role assignment
          if (role === 'broadcaster') {
            updatedRoom.broadcaster = newUserId;
          } else {
            updatedRoom.viewers.push(newUserId);
          }

          // Store user and connection
          users.set(newUserId, user);
          connections.set(newUserId, ws);

          const roomWithUsers = getRoomWithUsers(roomId);

          // Get recent chat messages
          const roomMessages = getRoomMessages(roomId);

          // Notify user of successful join
          sendMessage(ws, {
            type: 'ROOM_JOINED',
            payload: {
              room: roomWithUsers,
              user,
              messages: roomMessages, // Include recent messages
            } as RoomJoinedPayload,
            timestamp,
          });

          // If this is a viewer and there's an active broadcaster with stream
          if (role === 'viewer' && updatedRoom.broadcaster && activeStreams.get(roomId)) {
            notifyViewerOfBroadcaster(roomId, newUserId);
          }

          // Notify other users in the room
          broadcastToRoom(
            roomId,
            {
              type: 'USER_JOINED',
              payload: {
                user,
              } as UserJoinedPayload,
              timestamp,
            },
            newUserId
          );

          // Send updated room state to all users
          broadcastToRoom(roomId, {
            type: 'ROOM_STATE',
            payload: {
              room: roomWithUsers,
            } as RoomStatePayload,
            timestamp,
          });
          break;
        }

        case 'CHAT_MESSAGE': {
          if (!currentUserId) return;
          const user = users.get(currentUserId);
          if (!user) return;

          const { message: chatMessage } = message.payload as ChatMessagePayload;
          
          // Create a new message with server-generated ID and timestamp
          const newMessage: ChatMessage = {
            id: uuidv4(),
            senderId: user.id,
            senderUsername: user.username,
            roomId: user.roomId,
            content: chatMessage.content,
            type: chatMessage.type,
            recipientId: chatMessage.recipientId,
            timestamp: new Date().toISOString(),
          };

          // Store the message
          const roomMessages = chatMessages.get(user.roomId) || [];
          roomMessages.push(newMessage);
          chatMessages.set(user.roomId, roomMessages);

          console.log(`Chat message from ${user.username} in room ${user.roomId}: ${chatMessage.content}`);

          // For private messages, send only to the recipient
          if (chatMessage.type === 'private' && chatMessage.recipientId) {
            const recipientWs = connections.get(chatMessage.recipientId);
            if (recipientWs) {
              sendMessage(recipientWs, {
                type: 'CHAT_MESSAGE_RECEIVED',
                payload: {
                  message: newMessage,
                },
                timestamp: newMessage.timestamp,
              });
            }
            
            // Also send back to the sender
            sendMessage(ws, {
              type: 'CHAT_MESSAGE_RECEIVED',
              payload: {
                message: newMessage,
              },
              timestamp: newMessage.timestamp,
            });
          } else {
            // For public messages, broadcast to the entire room
            broadcastToRoom(user.roomId, {
              type: 'CHAT_MESSAGE_RECEIVED',
              payload: {
                message: newMessage,
              },
              timestamp: newMessage.timestamp,
            });
          }
          break;
        }

        case 'STREAM_READY': {
          if (!currentUserId) return;
          const user = users.get(currentUserId);
          if (!user || user.role !== 'broadcaster') return;

          console.log(`Broadcaster ${currentUserId} stream ready in room ${user.roomId}`);
          activeStreams.set(user.roomId, true);

          // Notify all viewers in the room
          const room = rooms.get(user.roomId);
          if (room) {
            room.viewers.forEach((viewerId) => {
              notifyViewerOfBroadcaster(user.roomId, viewerId);
            });
          }
          break;
        }

        case 'VIEWER_READY': {
          if (!currentUserId) return;
          const viewer = users.get(currentUserId);
          if (!viewer || viewer.role !== 'viewer') return;

          const room = rooms.get(viewer.roomId);
          if (!room || !room.broadcaster) return;

          // Notify broadcaster about this viewer being ready
          const broadcasterWs = connections.get(room.broadcaster);
          if (broadcasterWs) {
            sendMessage(broadcasterWs, {
              type: 'VIEWER_READY',
              payload: {
                viewer: viewer,
              },
              timestamp,
            });
          }
          break;
        }

        case 'OFFER':
        case 'ANSWER':
        case 'ICE_CANDIDATE': {
          if (!currentUserId) return;
          const { receiver, roomId, data } = message.payload as RTCSignalPayload;
          const receiverWs = connections.get(receiver);
          if (receiverWs) {
            sendMessage(receiverWs, {
              type: message.type,
              payload: {
                sender: currentUserId,
                receiver,
                roomId,
                data,
              } as RTCSignalPayload,
              timestamp,
            });
          }
          break;
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    if (currentUserId) {
      const user = users.get(currentUserId);
      if (user) {
        // If it's a broadcaster, remove active stream flag
        if (user.role === 'broadcaster') {
          activeStreams.delete(user.roomId);
        }

        const room = rooms.get(user.roomId);
        if (room) {
          if (user.role === 'broadcaster') {
            room.broadcaster = undefined;
          } else {
            room.viewers = room.viewers.filter((id) => id !== currentUserId);
          }

          // Notify others in the room about the user leaving and send updated room state
          const roomWithUsers = getRoomWithUsers(user.roomId);
          broadcastToRoom(
            user.roomId,
            {
              type: 'USER_LEFT',
              payload: {
                user,
                room: roomWithUsers,
              } as UserLeftPayload,
              timestamp: new Date().toISOString(),
            },
            currentUserId
          );

          // Remove empty rooms and their chat history
          if (!room.broadcaster && room.viewers.length === 0) {
            rooms.delete(user.roomId);
            chatMessages.delete(user.roomId);
          } else {
            // Send updated room state
            broadcastToRoom(user.roomId, {
              type: 'ROOM_STATE',
              payload: {
                room: roomWithUsers,
              } as RoomStatePayload,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
      users.delete(currentUserId);
      connections.delete(currentUserId);
    }
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 