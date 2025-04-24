import { useEffect, useRef, useState } from 'react';
import type {
  User,
  Room as RoomType,
  RTCSignalPayload,
  ErrorPayload,
  BroadcasterReadyPayload,
  ViewerReadyPayload,
} from '@vestream/shared';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useWebRTC } from '../hooks/useWebRTC';

interface RoomProps {
  roomId: string;
  username: string;
  role: 'broadcaster' | 'viewer';
  onError?: (error: ErrorPayload) => void;
}

export default function Room({ roomId, username, role, onError }: RoomProps) {
  const { connected, connect, disconnect, sendMessage, lastMessage } = useWebSocket();
  const [currentUser, setCurrentUser] = useState<User>();
  const [room, setRoom] = useState<RoomType>();
  const [remoteUser, setRemoteUser] = useState<User>();
  const [broadcaster, setBroadcaster] = useState<User>();
  const [error, setError] = useState<string>();
  const [isJoining, setIsJoining] = useState(false);
  const [isStreamReady, setIsStreamReady] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const hasJoinedRef = useRef(false);

  const { localStream, startLocalStream, handleIncomingSignal, initiateCall } = useWebRTC({
    user: currentUser,
    remoteUser: role === 'broadcaster' ? remoteUser : broadcaster,
    onTrack: (stream) => {
      console.log('Remote track received, setting remote video stream');
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    },
    sendMessage,
  });

  // Connect to WebSocket when component mounts
  useEffect(() => {
    console.log('Room component mounted, connecting to WebSocket...');
    connect();
    
    return () => {
      console.log('Room component unmounting, disconnecting WebSocket...');
      disconnect();
    };
  }, [connect, disconnect]);

  // Join room once connected
  useEffect(() => {
    if (!connected || isJoining || hasJoinedRef.current) return;

    console.log('Connected to WebSocket, attempting to join room...');
    setIsJoining(true);

    try {
      sendMessage({
        type: 'JOIN_ROOM',
        payload: {
          roomId,
          username,
          role,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error sending join room message:', error);
      setError('Failed to join room. Please try again.');
      setIsJoining(false);
    }
  }, [connected, roomId, username, role, sendMessage, isJoining]);

  // Notify server when broadcaster stream is ready
  useEffect(() => {
    if (!currentUser || !localStream || isStreamReady || currentUser.role !== 'broadcaster') return;

    console.log('Local stream ready, notifying server...');
    setIsStreamReady(true);
    
    sendMessage({
      type: 'STREAM_READY',
      payload: {
        roomId: currentUser.roomId,
        userId: currentUser.id,
      },
      timestamp: new Date().toISOString(),
    });
  }, [currentUser, localStream, sendMessage, isStreamReady]);

  // Notify server when viewer is ready for stream
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'viewer' || !room || !room.broadcaster) return;

    console.log('Viewer ready, notifying server about readiness to receive stream');
    sendMessage({
      type: 'VIEWER_READY',
      payload: {
        roomId: currentUser.roomId,
        userId: currentUser.id,
      },
      timestamp: new Date().toISOString(),
    });
  }, [currentUser, room, sendMessage]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    console.log('Handling WebSocket message:', lastMessage.type);

    switch (lastMessage.type) {
      case 'ERROR': {
        const errorPayload = lastMessage.payload as ErrorPayload;
        console.error('Received error:', errorPayload);
        setError(errorPayload.message);
        setIsJoining(false);
        onError?.(errorPayload);
        break;
      }

      case 'ROOM_JOINED': {
        const { room: newRoom, user } = lastMessage.payload as any;
        console.log('Successfully joined room:', newRoom.id, 'as user:', user.username);
        setRoom(newRoom);
        setCurrentUser(user);
        setError(undefined);
        setIsJoining(false);
        hasJoinedRef.current = true;

        // If broadcaster, start local stream
        if (user.role === 'broadcaster') {
          console.log('Starting local stream for broadcaster');
          startLocalStream();
        }
        
        // Set broadcaster if we're a viewer
        if (user.role === 'viewer' && newRoom.broadcaster) {
          const broadcasterUser = newRoom.users?.find((u: User) => u.id === newRoom.broadcaster);
          if (broadcasterUser) {
            setBroadcaster(broadcasterUser);
          }
        }
        break;
      }

      case 'BROADCASTER_READY': {
        if (!currentUser || currentUser.role !== 'viewer') break;
        
        const { broadcaster: broadcasterUser } = lastMessage.payload as BroadcasterReadyPayload;
        console.log('Broadcaster is ready with stream:', broadcasterUser.username);
        setBroadcaster(broadcasterUser);
        
        // The broadcaster will initiate the call
        break;
      }

      case 'VIEWER_READY': {
        if (!currentUser || currentUser.role !== 'broadcaster' || !localStream) break;
        
        const { viewer } = lastMessage.payload as ViewerReadyPayload;
        console.log('Viewer is ready for stream:', viewer.username);
        
        if (isStreamReady) {
          console.log('Stream is ready, initiating call to viewer');
          
          // For multi-viewer support, we set remoteUser temporarily to the new viewer
          // just for the duration of the call initiation
          setRemoteUser(viewer);
          
          // Wait briefly for remoteUser to be set
          setTimeout(() => {
            console.log('Initiating call to viewer after timeout');
            initiateCall();
          }, 500);
        }
        break;
      }

      case 'ROOM_STATE': {
        const { room: updatedRoom } = lastMessage.payload as any;
        console.log('Room state updated:', updatedRoom);
        setRoom(updatedRoom);
        break;
      }

      case 'USER_JOINED': {
        const { user: newUser } = lastMessage.payload as any;
        console.log('User joined:', newUser.username, 'with role:', newUser.role);

        if (newUser.role === 'broadcaster' && currentUser?.role === 'viewer') {
          setBroadcaster(newUser);
        } else if (newUser.role === 'viewer' && currentUser?.role === 'broadcaster') {
          // We'll wait for VIEWER_READY before setting remoteUser
        }
        break;
      }

      case 'USER_LEFT': {
        const { user: leftUser } = lastMessage.payload as any;
        console.log('User left:', leftUser.username);
        
        if (leftUser.role === 'broadcaster' && currentUser?.role === 'viewer') {
          setBroadcaster(undefined);
          // Clear remote video
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
          }
        } else if (remoteUser?.id === leftUser.id) {
          setRemoteUser(undefined);
        }
        break;
      }

      case 'OFFER':
      case 'ANSWER':
      case 'ICE_CANDIDATE': {
        console.log('Handling WebRTC signal:', lastMessage.type);
        handleIncomingSignal(lastMessage.payload as RTCSignalPayload);
        break;
      }
    }
  }, [lastMessage, currentUser, startLocalStream, initiateCall, handleIncomingSignal, onError, localStream, isStreamReady, remoteUser]);

  // Set local video stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log('Setting local video stream');
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!connected || isJoining) {
    return (
      <div className="p-4">
        <div className="bg-blue-50 border border-blue-400 text-blue-700 px-4 py-3 rounded">
          <p>{isJoining ? 'Joining room...' : 'Connecting to server...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-xl font-bold">Room: {room?.name}</h2>
        <p className="text-gray-600">
          Role: {role} | Users: {(room?.viewers?.length || 0) + (room?.broadcaster ? 1 : 0)}
        </p>
      </div>

      <div className={`grid ${role === 'broadcaster' ? 'grid-cols-2 md:grid-cols-3 gap-4' : 'grid-cols-1 gap-4'}`}>
        {/* Broadcaster's own video */}
        {role === 'broadcaster' && (
          <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded">
              You (Broadcaster)
            </div>
          </div>
        )}

        {/* Broadcaster's view of viewers */}
        {role === 'broadcaster' && remoteUser && (
          <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded">
              {remoteUser.username} (Viewer)
            </div>
          </div>
        )}

        {/* Viewer count for broadcaster */}
        {role === 'broadcaster' && room?.viewers && room.viewers.length > 0 && (
          <div className="relative aspect-video bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center">
            <div className="text-white text-center p-4">
              <div className="text-3xl font-bold">{room.viewers.length}</div>
              <div>Active Viewers</div>
            </div>
          </div>
        )}

        {/* Viewer's view of broadcaster */}
        {role === 'viewer' && (
          <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded">
              Broadcaster {broadcaster?.username ? `(${broadcaster.username})` : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 