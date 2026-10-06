# Monsoon Mayhem V0.3

A self-hosted, real-time party game for 2–8 players. Run `node server.js`, then open `http://localhost:4173`. Players on the same Wi-Fi can open the host computer's network address on port 4173 and join with the six-character room code.

The game keeps its room-code and shared room-state architecture. Players secretly choose Trade, Sandbag, Divert, or Big Trade; previews show expected outcomes using the current water and revealed weather. Once all choices resolve, every player sees the same brief action reveal, followed by the weather effect and result callouts. Each of the six rounds starts with one randomly selected weather event. The server resolves starting-water payouts, simultaneous water actions, weather, and Big Trade's added water in that order. Round History is shared and remains visible through Game Over.

Rooms are temporary and stored in memory; they reset when the server stops. A missed choice automatically becomes Sandbag when the 25-second round timer expires. No accounts or external services are required.

## Play

1. Start the server on a computer reachable by the players.
2. Open the address on that computer and create a bazaar.
3. Share the computer's local network address and room code with 1–7 friends.
4. Start once everyone has joined.
