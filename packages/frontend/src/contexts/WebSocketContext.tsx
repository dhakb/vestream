import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { WSMessage } from '@vestream/shared';

interface WebSocketContextType {
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: WSMessage) => void;
  lastMessage: WSMessage | null;
}

const WebSocketContext = createContext<WebSocketContextType>({
  connected: false,
  connect: () => {},
  disconnect: () => {},
  sendMessage: () => {},
  lastMessage: null,
});

export const useWebSocket = () => useContext(WebSocketContext);

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const connectingRef = useRef(false);

  const connect = useCallback(() => {
    // Prevent multiple connection attempts
    if (connectingRef.current || ws.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connecting or connected');
      return;
    }

    connectingRef.current = true;

    try {
      console.log('Attempting to connect to WebSocket...');
      ws.current = new WebSocket('ws://localhost:3000');

      ws.current.onopen = () => {
        console.log('WebSocket connection established');
        setConnected(true);
        connectingRef.current = false;
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        setConnected(false);
        ws.current = null;
        connectingRef.current = false;
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        connectingRef.current = false;
      };

      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;
          console.log('Received WebSocket message:', message);
          setLastMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      setConnected(false);
      connectingRef.current = false;
    }
  }, []);

  const disconnect = useCallback(() => {
    console.log('Disconnecting WebSocket...');
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    setConnected(false);
    setLastMessage(null);
    connectingRef.current = false;
  }, []);

  const sendMessage = useCallback((message: WSMessage) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send message: WebSocket is not connected');
      return;
    }

    try {
      console.log('Sending WebSocket message:', message);
      ws.current.send(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <WebSocketContext.Provider value={{ connected, connect, disconnect, sendMessage, lastMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
} 