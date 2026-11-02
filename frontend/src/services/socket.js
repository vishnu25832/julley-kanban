import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

let socket = null;
let currentToken = null;
let onlineHandler = null;

function removeOnlineListener() {
  if (onlineHandler) {
    window.removeEventListener("online", onlineHandler);
    onlineHandler = null;
  }
}

export function connectSocket(token) {
  if (!token) {
    throw new Error("Authentication token is required");
  }

  // Reuse the existing authenticated connection.
  if (socket && currentToken === token) {
    if (!socket.connected && !socket.active) {
      socket.connect();
    }

    return socket;
  }

  // Remove the previous connection if the user/token changes.
  if (socket) {
    removeOnlineListener();
    socket.disconnect();
    socket = null;
  }

  currentToken = token;

  socket = io(SOCKET_URL, {
    auth: { token },

    // Use Socket.IO's default polling-to-WebSocket transport upgrade.
    reconnection: true,

    // Never permanently stop retrying after temporary network failures.
    reconnectionAttempts: Infinity,

    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,

    timeout: 20000,
    autoConnect: true,
  });

  socket.on("connect", () => {
    console.log("Socket connected:", socket.id);
  });

  socket.on("connect_error", (error) => {
    console.error(
      "Socket connection failed:",
      error.message
    );
  });

  socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", reason);
  });

  // Log automatic reconnection attempts.
  socket.io.on("reconnect_attempt", (attempt) => {
    console.log("Socket reconnection attempt:", attempt);
  });

  socket.io.on("reconnect", (attempt) => {
    console.log(
      "Socket successfully reconnected after attempts:",
      attempt
    );
  });

  // Immediately retry when the browser regains network connectivity.
  onlineHandler = () => {
    console.log("Browser network restored. Forcing socket reconnection.");

    if (socket && currentToken) {
      socket.disconnect();
      socket.connect();
    }
  };

  window.addEventListener("online", onlineHandler);

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  removeOnlineListener();

  if (socket) {
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
}
