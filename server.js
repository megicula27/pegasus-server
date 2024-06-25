const WebSocket = require("ws");
const http = require("http");

const port = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebSocket server is running");
});

const wss = new WebSocket.Server({ server });

const clients = new Map();
const pendingInvitations = new Map();
const activeGames = new Map();

wss.on("connection", (ws) => {
  let userId = "";

  ws.on("message", (message) => {
    const data = JSON.parse(message);

    if (data.type === "register") {
      userId = data.userID;
      clients.set(userId, ws);
      // Send current state to the user
      const userState = {
        type: "userState",
        hasPendingInvitation: pendingInvitations.has(userId),
        inActiveGame: activeGames.has(userId),
      };
      ws.send(JSON.stringify(userState));
    } else if (data.type === "invitation") {
      const recipientWs = clients.get(data.to);
      const senderWs = clients.get(data.from);
      const confirmationData = { ...data, type: "sentInvitation" };
      if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
        if (!pendingInvitations.has(data.to) && !activeGames.has(data.to)) {
          console.log("Forwarding invitation to:", data.to);
          pendingInvitations.set(data.to, data.from);
          recipientWs.send(JSON.stringify(data));
          senderWs.send(JSON.stringify(confirmationData));
        } else {
          // Notify sender that recipient is unavailable
          ws.send(
            JSON.stringify({
              type: "invitationFailed",
              message: "User is unavailable for invitations at the moment.",
            })
          );
        }
      } else {
        console.log("Recipient not found or not connected:", data.to);
      }
    } else if (data.type === "response") {
      const recipientWs = clients.get(data.to);
      if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
        recipientWs.send(JSON.stringify(data));

        // Remove pending invitation
        pendingInvitations.delete(data.from);

        if (data.response === "accept") {
          // Start active game
          activeGames.set(data.from, data.to);
          activeGames.set(data.to, data.from);
        }
      }
    }
  });

  ws.on("close", () => {
    if (userId) {
      clients.delete(userId);
      pendingInvitations.delete(userId);
      const opponent = activeGames.get(userId);
      if (opponent) {
        activeGames.delete(userId);
        activeGames.delete(opponent);
      }
    }
  });
});

server.listen(port, () => {
  console.log(`WebSocket server running on port ${port}`);
});
