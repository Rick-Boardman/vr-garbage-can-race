// Only game chrome lives here: solo entry, status, countdown and the dresser.
// Tables, names, invitations and lobby chat are rendered by the pinned Magna module.
import { mountPlayLobby } from "../vendor/magna-play/61275e8c5542/play-lobby.js";
import { createDresser } from "./dresser.js";
import { cleanName, recallName, rememberName } from "./looks.js";

export function createGameUi({ onLook, onAlone }) {
  const dresser = createDresser({ onLook });
  let activeName = "";
  const entry = document.createElement("main");
  entry.id = "play-entry";
  const solo = document.createElement("button");
  solo.id = "ride-alone";
  solo.textContent = "Ride alone";
  solo.onclick = onAlone;
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const host = document.createElement("div");
  entry.append(solo, status, host);
  const countdown = document.createElement("p");
  countdown.id = "start-countdown";
  countdown.hidden = true;
  document.body.append(entry, countdown);
  return {
    mount(options) {
      return mountPlayLobby(host, {
        ...options, displayName: recallName(localStorage),
        preview: container => dresser.mount(container),
      });
    },
    show() { dresser.close(); activeName = ""; entry.hidden = false; },
    hide() { dresser.close(); entry.hidden = true; },
    getStatus: () => status.textContent,
    setStatus(text) { status.textContent = text; },
    setHillChrome(which) { if (which === "none") dresser.close(); },
    setCountdown(text) { countdown.textContent = text; countdown.hidden = !text; },
    setName(name) { activeName = cleanName(name); rememberName(localStorage, activeName); },
    name: () => activeName || host.querySelector('input[autocomplete="nickname"]')?.value || recallName(localStorage),
    look: dresser.look,
    styleOpen: dresser.styleOpen,
    stylingOpen: dresser.stylingOpen,
    toggleStyle: dresser.toggleStyle,
  };
}
