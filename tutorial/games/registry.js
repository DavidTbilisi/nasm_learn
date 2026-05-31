'use strict';

// Game registry — order here = display order in the Arcade picker.
// New games append; existing games keep their position so localStorage keys stay stable.

window.ARCADE_GAMES = [
  window.BeltGame,
  window.SignalGame,
  window.RoverGame,
  window.CourierGame,
  window.HeistGame,
].filter(Boolean);
