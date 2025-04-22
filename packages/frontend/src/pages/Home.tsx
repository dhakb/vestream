import { useEffect, useState } from 'react';
import type { WSMessage } from '@vestream/shared';

export default function Home() {
  const [messages, setMessages] = useState<string[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    const websocket = new WebSocket('ws://localhost:3000');
    
    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data) as WSMessage;
      setMessages(prev => [...prev, message.payload as string]);
    };

    websocket.onclose = () => {
      console.log('WebSocket connection closed');
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, []);

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Welcome to VeStream</h1>
      <div className="space-y-4">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h2 className="text-lg font-semibold text-gray-700 mb-2">WebSocket Messages</h2>
          <div className="space-y-2">
            {messages.map((message, index) => (
              <div key={index} className="bg-white p-3 rounded shadow">
                {message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 