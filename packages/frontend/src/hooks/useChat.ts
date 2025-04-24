import { useState, useEffect, useCallback } from 'react';
import type { ChatMessage, User } from '@vestream/shared';
import { useWebSocket } from '../contexts/WebSocketContext';

interface UseChatProps {
  roomId: string;
  currentUser?: User;
}

export function useChat({ roomId, currentUser }: UseChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const { sendMessage, lastMessage } = useWebSocket();

  // Initialize messages when joining a room
  useEffect(() => {
    if (lastMessage?.type === 'ROOM_JOINED') {
      const { messages: initialMessages } = lastMessage.payload as any;
      if (Array.isArray(initialMessages)) {
        setMessages(initialMessages);
      }
    }
  }, [lastMessage]);

  // Update users when room state changes
  useEffect(() => {
    if (lastMessage?.type === 'ROOM_STATE') {
      const { room } = lastMessage.payload as any;
      if (room?.users) {
        setUsers(room.users);
      }
    }
  }, [lastMessage]);

  // Listen for new chat messages
  useEffect(() => {
    if (lastMessage?.type === 'CHAT_MESSAGE_RECEIVED') {
      const { message } = lastMessage.payload as any;
      if (message) {
        setMessages((prevMessages) => [...prevMessages, message]);
      }
    }
  }, [lastMessage]);

  // Send a new chat message
  const sendChatMessage = useCallback(
    (content: string, recipientId?: string) => {
      if (!currentUser || !content.trim()) {
        return;
      }

      const messageType = recipientId ? 'private' : 'public';

      sendMessage({
        type: 'CHAT_MESSAGE',
        payload: {
          message: {
            content: content.trim(),
            type: messageType,
            recipientId,
            roomId,
          },
        },
        timestamp: new Date().toISOString(),
      });
    },
    [currentUser, roomId, sendMessage]
  );

  return {
    messages,
    users,
    sendChatMessage,
  };
} 