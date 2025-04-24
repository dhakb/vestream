import { ChatMessage as ChatMessageType } from '@vestream/shared';
import { formatDistanceToNow } from 'date-fns';

interface ChatMessageProps {
  message: ChatMessageType;
  isCurrentUser: boolean;
}

export function ChatMessage({ message, isCurrentUser }: ChatMessageProps) {
  const timestamp = new Date(message.timestamp);
  const timeAgo = formatDistanceToNow(timestamp, { addSuffix: true });
  
  return (
    <div
      className={`p-2 mb-2 rounded-lg ${
        isCurrentUser
          ? 'bg-blue-100 ml-8'
          : 'bg-gray-100 mr-8'
      }`}
    >
      <div className="flex justify-between items-start">
        <span className={`font-semibold text-sm ${message.type === 'private' ? 'text-purple-700' : ''}`}>
          {isCurrentUser ? 'You' : message.senderUsername}
          {message.type === 'private' && ' (private)'}
        </span>
        <span className="text-xs text-gray-500">{timeAgo}</span>
      </div>
      <p className="mt-1 text-sm">{message.content}</p>
    </div>
  );
} 