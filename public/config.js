// Where the WebSocket game server lives. When the page is served by the game server itself
// (localhost or the Render URL) the client connects to the same origin instead.
// Override per visit with ?server=wss://your-server.example.com
window.VECK_CONFIG = {
  server: 'wss://veck-io-server.onrender.com',
};
