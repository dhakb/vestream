import { useRef, useEffect } from 'react';
import type { User } from '@vestream/shared';
import { useChat } from '../../hooks/useChat';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

interface ChatPanelProps {
  roomId: string;
  currentUser?: User;
}

export function ChatPanel({ roomId, currentUser }: ChatPanelProps) {
  const { messages, users, sendChatMessage } = useChat({
    roomId,
    currentUser,
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);
  
  if (!currentUser) {
    return null;
  }
  
  return (
    <div className="flex flex-col h-full border rounded-lg bg-white overflow-hidden">
      <div className="bg-gray-100 p-3 border-b">
        <h3 className="font-semibold">Room Chat</h3>
        <div className="text-xs text-gray-500">
          {users.length} {users.length === 1 ? 'user' : 'users'} online
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-4">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              isCurrentUser={message.senderId === currentUser.id}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <ChatInput
        onSendMessage={sendChatMessage}
        users={users}
        currentUserId={currentUser.id}
      />
    </div>
  );
} 