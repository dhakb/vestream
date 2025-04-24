import { useState, FormEvent, KeyboardEvent, ChangeEvent } from 'react';
import type { User } from '@vestream/shared';

interface ChatInputProps {
  onSendMessage: (content: string, recipientId?: string) => void;
  users: User[];
  currentUserId?: string;
}

export function ChatInput({ onSendMessage, users, currentUserId }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<string | undefined>();
  
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    
    onSendMessage(message, selectedRecipient);
    setMessage('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  // Filter users to exclude the current user
  const otherUsers = users.filter(user => user.id !== currentUserId);
  
  return (
    <form onSubmit={handleSubmit} className="p-2 bg-white border-t">
      <div className="flex items-center mb-2">
        <span className="text-sm mr-2">To:</span>
        <select
          value={selectedRecipient || ''}
          onChange={(e) => setSelectedRecipient(e.target.value || undefined)}
          className="text-sm bg-gray-100 rounded py-1 px-2 flex-1"
        >
          <option value="">Everyone (Public)</option>
          {otherUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.username} (Private)
            </option>
          ))}
        </select>
      </div>
      
      <div className="flex">
        <textarea
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 resize-none border rounded-l p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
          rows={2}
        />
        <button
          type="submit"
          disabled={!message.trim()}
          className="bg-blue-500 text-white px-4 py-2 rounded-r hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        Press Enter to send, Shift+Enter for new line
      </p>
    </form>
  );
} 