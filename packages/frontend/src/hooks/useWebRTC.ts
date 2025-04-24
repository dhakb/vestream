import { useCallback, useEffect, useRef, useState } from 'react';
import type { User, RTCSignalPayload } from '@vestream/shared';

interface UseWebRTCProps {
  user?: User;
  remoteUser?: User;
  onTrack?: (stream: MediaStream) => void;
  sendMessage: (message: any) => void;
}

export function useWebRTC({ user, remoteUser, onTrack, sendMessage }: UseWebRTCProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  // Store multiple peer connections in a map (userId -> RTCPeerConnection)
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  // Track pending ICE candidates that arrive before the connection is ready
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidate[]>>(new Map());
  // Keep track of connection state for each peer
  const connectionStatesRef = useRef<Map<string, string>>(new Map());
  
  // Clean up peer connections on unmount or when users change
  const cleanup = useCallback(() => {
    console.log('Cleaning up WebRTC resources');
    
    // Close all peer connections
    peerConnectionsRef.current.forEach((pc, userId) => {
      console.log(`Closing peer connection with user ${userId}`);
      pc.close();
    });
    peerConnectionsRef.current.clear();
    pendingIceCandidatesRef.current.clear();
    connectionStatesRef.current.clear();
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
  }, []);

  // Create a new peer connection for a specific remote user
  const createPeerConnection = useCallback((targetUser: User) => {
    if (!user) {
      console.log('Cannot create peer connection: missing local user');
      return null;
    }

    console.log(`Creating peer connection between ${user.username} and ${targetUser.username}`);
    
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    
    // Store initial connection state
    connectionStatesRef.current.set(targetUser.id, pc.signalingState);
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Sending ICE candidate to ${targetUser.username}`);
        sendMessage({
          type: 'ICE_CANDIDATE',
          payload: {
            sender: user.id,
            receiver: targetUser.id,
            roomId: user.roomId,
            data: event.candidate
          },
          timestamp: new Date().toISOString(),
        });
      }
    };
    
    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${targetUser.username}:`, pc.iceConnectionState);
      
      // Clean up peer connection if disconnected/failed
      if (pc.iceConnectionState === 'disconnected' || 
          pc.iceConnectionState === 'failed' ||
          pc.iceConnectionState === 'closed') {
        console.log(`Connection with ${targetUser.username} is ${pc.iceConnectionState}, removing peer connection`);
        peerConnectionsRef.current.delete(targetUser.id);
        pendingIceCandidatesRef.current.delete(targetUser.id);
        connectionStatesRef.current.delete(targetUser.id);
      }
    };
    
    // Handle signaling state changes
    pc.onsignalingstatechange = () => {
      console.log(`Signaling state with ${targetUser.username} changed to:`, pc.signalingState);
      connectionStatesRef.current.set(targetUser.id, pc.signalingState);
      
      // If connection is stable again and we have pending ICE candidates, try to add them
      if (pc.signalingState === 'stable') {
        const pendingCandidates = pendingIceCandidatesRef.current.get(targetUser.id) || [];
        if (pendingCandidates.length > 0) {
          console.log(`Connection is stable, adding ${pendingCandidates.length} pending ICE candidates for ${targetUser.username}`);
          pendingCandidates.forEach(candidate => {
            pc.addIceCandidate(candidate)
              .catch(err => console.error('Error adding pending ICE candidate:', err));
          });
          pendingIceCandidatesRef.current.delete(targetUser.id);
        }
      }
    };
    
    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log(`Received remote track from ${targetUser.username}`);
      const [remoteStream] = event.streams;
      if (remoteStream) {
        onTrack?.(remoteStream);
      }
    };
    
    // Add local tracks to the peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        if (localStreamRef.current) {
          console.log(`Adding local ${track.kind} track to peer connection with ${targetUser.username}`);
          pc.addTrack(track, localStreamRef.current);
        }
      });
    } else {
      console.warn('No local stream available to add tracks to peer connection');
    }
    
    // Store the peer connection
    peerConnectionsRef.current.set(targetUser.id, pc);
    
    return pc;
  }, [user, sendMessage, onTrack]);

  // Start local media stream
  const startLocalStream = useCallback(async () => {
    console.log('Starting local stream');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      
      console.log('Local stream started successfully with tracks:', stream.getTracks().length);
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error('Error starting local stream:', error);
      return null;
    }
  }, []);

  // Add an ICE candidate either directly or store it for later
  const addIceCandidate = useCallback((userId: string, candidate: RTCIceCandidate, pc: RTCPeerConnection) => {
    const state = connectionStatesRef.current.get(userId) || pc.signalingState;
    
    // Only add ICE candidates if we're in an appropriate state
    if (state === 'stable' || state === 'have-remote-offer' || state === 'have-local-pranswer') {
      console.log(`Adding ICE candidate for user ${userId}`);
      pc.addIceCandidate(candidate)
        .catch(err => {
          console.error('Error adding ICE candidate:', err);
          // Store it for later if we fail to add it now
          let pendingCandidates = pendingIceCandidatesRef.current.get(userId) || [];
          pendingCandidates.push(candidate);
          pendingIceCandidatesRef.current.set(userId, pendingCandidates);
        });
    } else {
      // Save the candidate for later
      console.log(`Signaling state not ready, storing ICE candidate for later for user ${userId}`);
      let pendingCandidates = pendingIceCandidatesRef.current.get(userId) || [];
      pendingCandidates.push(candidate);
      pendingIceCandidatesRef.current.set(userId, pendingCandidates);
    }
  }, []);

  // Handle incoming WebRTC signals
  const handleIncomingSignal = useCallback((payload: RTCSignalPayload) => {
    if (!user) {
      console.warn('Cannot handle signal: user not set');
      return;
    }
    
    // Verify this signal is for us
    if (payload.receiver !== user.id) {
      console.log('Signal not for us, ignoring');
      return;
    }
    
    const { sender, data } = payload;
    const signalType = data && data.type ? data.type : data && data.candidate ? 'ice-candidate' : 'unknown';
    console.log(`Handling signal from ${sender}, type: ${signalType}`);
    
    // Get the peer connection for this sender, or create one if it doesn't exist
    let pc = peerConnectionsRef.current.get(sender);
    
    if (!pc) {
      console.log(`No existing peer connection for user ${sender}, creating new one`);
      
      let newPc: RTCPeerConnection | null = null;
      
      // For a viewer, we need to make sure remoteUser is set to handle the broadcaster
      if (user.role === 'viewer' && remoteUser) {
        newPc = createPeerConnection(remoteUser);
      } 
      // For a broadcaster, we need to find the viewer details
      else if (user.role === 'broadcaster') {
        // We need to fabricate a User object for the sender since we only have the ID
        const viewerUser: User = {
          id: sender,
          username: `User-${sender.substring(0, 5)}`, // Just a placeholder name
          role: 'viewer',
          roomId: user.roomId
        };
        newPc = createPeerConnection(viewerUser);
      }
      
      if (!newPc) {
        console.error('Failed to create peer connection');
        return;
      }
      
      pc = newPc;
    }
    
    // Handle the signal based on its content
    if (data && data.type === 'offer') {
      console.log('Processing offer in state:', pc.signalingState);
      pc.setRemoteDescription(new RTCSessionDescription(data))
        .then(() => pc.createAnswer())
        .then(answer => pc.setLocalDescription(answer))
        .then(() => {
          if (pc.localDescription) {
            console.log('Sending answer');
            sendMessage({
              type: 'ANSWER',
              payload: {
                sender: user.id,
                receiver: sender,
                roomId: user.roomId,
                data: pc.localDescription
              },
              timestamp: new Date().toISOString(),
            });
          }
        })
        .catch(err => console.error('Error handling offer:', err));
    } else if (data && data.type === 'answer') {
      console.log('Processing answer in state:', pc.signalingState);
      
      // Only process answer if we're in the right state
      if (pc.signalingState === 'have-local-offer') {
        pc.setRemoteDescription(new RTCSessionDescription(data))
          .then(() => {
            console.log('Successfully set remote description for answer');
            // Process any stored ICE candidates now that the connection is established
            const pendingCandidates = pendingIceCandidatesRef.current.get(sender) || [];
            if (pendingCandidates.length > 0) {
              console.log(`Processing ${pendingCandidates.length} pending ICE candidates after setting answer`);
              pendingCandidates.forEach(candidate => {
                pc.addIceCandidate(candidate)
                  .catch(err => console.error('Error adding stored ICE candidate:', err));
              });
              pendingIceCandidatesRef.current.delete(sender);
            }
          })
          .catch(err => {
            console.error('Error handling answer:', err);
            // If we get an error, we might want to reset the connection and try again
            if (pc.signalingState !== 'stable') {
              console.log('Peer connection is in an unstable state, may need to be recreated');
            }
          });
      } else {
        console.warn(`Cannot process answer in current signaling state: ${pc.signalingState}`);
      }
    } else if (data && data.candidate) {
      addIceCandidate(sender, new RTCIceCandidate(data), pc);
    }
  }, [user, remoteUser, createPeerConnection, sendMessage, addIceCandidate]);

  // Initiate a call to a specific remote user
  const initiateCall = useCallback(async () => {
    if (!user || !remoteUser) {
      console.warn('Cannot initiate call: missing user or remoteUser');
      return;
    }
    
    console.log(`Initiating call from ${user.username} to ${remoteUser.username}`);
    
    // Get existing peer connection or create a new one
    let pc = peerConnectionsRef.current.get(remoteUser.id);
    if (!pc) {
      const newPc = createPeerConnection(remoteUser);
      if (!newPc) {
        console.error('Failed to create peer connection');
        return;
      }
      pc = newPc;
    } else if (pc.signalingState !== 'stable') {
      console.log(`Connection in ${pc.signalingState} state, closing and creating new connection`);
      pc.close();
      const newPc = createPeerConnection(remoteUser);
      if (!newPc) {
        console.error('Failed to create peer connection');
        return;
      }
      pc = newPc;
    }
    
    try {
      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      if (pc.localDescription) {
        console.log(`Sending offer to ${remoteUser.username}`);
        sendMessage({
          type: 'OFFER',
          payload: {
            sender: user.id,
            receiver: remoteUser.id,
            roomId: user.roomId,
            data: pc.localDescription
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }, [user, remoteUser, createPeerConnection, sendMessage]);

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Clean up and recreate peer connection when remote user changes
  useEffect(() => {
    // We don't need to clean up existing connections when remote user changes
    // since we now support multiple connections. We'll create a new one as needed.
  }, [remoteUser?.id]);

  return {
    localStream,
    startLocalStream,
    handleIncomingSignal,
    initiateCall,
  };
} 