/**
 * main.js — bootstraps the 3D game once the DOM is ready.
 */

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  const minimap = document.getElementById('minimap');
  const game = new Game3D(canvas, minimap);

  if (isMobileDevice()) {
    // No touch control scheme exists for a flight-sim that needs
    // turn/pitch/thrust/fire keys, so it's never playable here — but still
    // build and animate the scene so the space and its devices are visible
    // (slowly orbiting) behind the message, instead of a blank panel.
    game.buildAmbientWorld();
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('visible'));
    document.getElementById('screen-mobile-blocked').classList.add('visible');
    const muteBtn = document.getElementById('btn-mute');
    if (muteBtn) muteBtn.style.display = 'none';
    window.__game3d = game;
    return;
  }

  // any of these buttons are a user gesture, so this is where audio unlocks
  document.getElementById('btn-start').addEventListener('click', () => {
    SFX.unlock();
    SFX.start();
    game.start();
  });
  document.getElementById('btn-resume').addEventListener('click', () => {
    SFX.uiClick();
    game.togglePause();
  });
  document.getElementById('btn-retry-over').addEventListener('click', () => {
    SFX.uiClick();
    game.start();
  });
  document.getElementById('btn-retry-win').addEventListener('click', () => {
    SFX.uiClick();
    game.start();
  });

  const muteBtn = document.getElementById('btn-mute');
  const syncMuteBtn = () => {
    const muted = SFX.isMuted();
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.classList.toggle('is-muted', muted);
    muteBtn.setAttribute('aria-pressed', String(muted));
  };
  muteBtn.addEventListener('click', () => {
    SFX.unlock();
    SFX.toggleMuted();
    syncMuteBtn();
  });
  syncMuteBtn();

  window.__game3d = game;
});
