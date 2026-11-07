// The game's own front room. People, public chat, and open tables live here.
// Hosting or joining uncovers the hill and holds the can at the start line.
// The rider and the can are chosen here. Chat and a table need a name that
// nobody else in this session is using.

import {
  AGES,
  BODIES,
  BOTTOMS,
  CAN_COLORS,
  CAN_MATERIALS,
  CAN_SHAPES,
  CAN_SIZES,
  HAIR_STYLES,
  LOGO_COLORS,
  LOGOS,
  RIDER_LOOKS,
  TOPS,
  defaultLook,
  nameBlock,
} from "./looks.js";

export function createLobby({ canHost = true, onHost, onJoin, onSeal, onLeave, onAlone, onInvite, onAccept, onDecline, onBack, onName }) {
  const shell = document.createElement("section");
  shell.id = "lobby";

  const header = document.createElement("header");
  header.id = "lobby-header";
  const title = document.createElement("h1");
  title.textContent = "Garbage Can Race";
  const status = document.createElement("p");
  status.id = "lobby-status";
  header.append(title, status);

  const peopleTitle = document.createElement("h2");
  peopleTitle.textContent = "In the lobby";
  const peopleList = document.createElement("div");
  peopleList.id = "lobby-people";
  const peoplePane = document.createElement("aside");
  peoplePane.append(peopleTitle, peopleList);

  const roomCard = document.createElement("div");
  roomCard.id = "lobby-room";
  roomCard.hidden = true;
  const codeLine = document.createElement("p");
  codeLine.id = "lobby-code";
  const names = document.createElement("p");
  names.id = "lobby-names";
  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.id = "lobby-start";
  startButton.textContent = "Start";
  startButton.title = "Start the countdown now, even if a slot is still open.";
  const leaveButton = document.createElement("button");
  leaveButton.type = "button";
  leaveButton.id = "lobby-leave";
  leaveButton.textContent = "Leave";
  roomCard.append(codeLine, names, startButton, leaveButton);

  const log = document.createElement("div");
  log.id = "lobby-log";
  const composer = document.createElement("form");
  composer.id = "lobby-composer";
  const chatInput = document.createElement("input");
  chatInput.id = "lobby-chat";
  chatInput.maxLength = 4000;
  chatInput.autocomplete = "off";
  chatInput.placeholder = "Say something";
  const sendButton = document.createElement("button");
  sendButton.type = "submit";
  sendButton.textContent = "Send";
  composer.append(chatInput, sendButton);

  const soloButton = document.createElement("button");
  soloButton.type = "button";
  soloButton.id = "lobby-solo";
  const soloTitle = document.createElement("span");
  soloTitle.textContent = "Click here to play solo";
  const soloHint = document.createElement("span");
  soloHint.textContent = "or click Ride alone on the right";
  soloButton.append(soloTitle, soloHint);

  const center = document.createElement("div");
  center.id = "lobby-center";
  center.append(soloButton, roomCard, log, composer);

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Name";
  const nameInput = document.createElement("input");
  nameInput.id = "lobby-name";
  nameInput.maxLength = 24;
  nameInput.autocomplete = "nickname";
  nameLabel.append(nameInput);

  const slotsLabel = document.createElement("label");
  slotsLabel.textContent = "Riders";
  const slotsSelect = document.createElement("select");
  slotsSelect.id = "lobby-slots";
  slotsLabel.append(slotsSelect);

  const hostButton = document.createElement("button");
  hostButton.type = "button";
  hostButton.id = "lobby-host";
  hostButton.textContent = "Host";
  hostButton.disabled = !canHost;
  if (!canHost) hostButton.title = "A phone can't host. Join from here, or host on a computer or headset.";

  const codeLabel = document.createElement("label");
  codeLabel.textContent = "Code";
  const codeInput = document.createElement("input");
  codeInput.id = "lobby-join-code";
  codeInput.maxLength = 4;
  codeInput.autocomplete = "off";
  codeInput.spellcheck = false;
  codeLabel.append(codeInput);
  const joinButton = document.createElement("button");
  joinButton.type = "button";
  joinButton.id = "lobby-join";
  joinButton.textContent = "Join";
  const aloneButton = document.createElement("button");
  aloneButton.type = "button";
  aloneButton.id = "lobby-alone";
  aloneButton.textContent = "Ride alone";

  const picked = defaultLook();

  const setup = document.createElement("div");
  setup.id = "lobby-setup";
  setup.append(
    choiceRow("Body", BODIES, "body"),
    choiceRow("Age", AGES, "age"),
    choiceRow("Top", TOPS, "top"),
    pickRow("Shirt", RIDER_LOOKS, "shirtRand"),
    choiceRow("Bottom", BOTTOMS, "bottom"),
    choiceRow("Hair", HAIR_STYLES, "hair"),
    choiceRow("Can", CAN_SHAPES, "canShape"),
    choiceRow("Size", CAN_SIZES, "canSize"),
    choiceRow("Finish", CAN_MATERIALS, "canMaterial"),
    pickRow("Color", CAN_COLORS, "can"),
    choiceRow("Logo", LOGOS, "logo"),
    pickRow("Mark", LOGO_COLORS, "logoColor"),
    nameLabel,
    slotsLabel,
    hostButton,
    codeLabel,
    joinButton,
    aloneButton,
  );

  const gamesTitle = document.createElement("h2");
  gamesTitle.textContent = "Open games";
  const gamesList = document.createElement("div");
  gamesList.id = "lobby-games";
  const gamesPane = document.createElement("aside");
  gamesPane.id = "lobby-side";
  gamesPane.append(setup, gamesTitle, gamesList);

  shell.append(header, peoplePane, center, gamesPane);

  const banner = document.createElement("div");
  banner.id = "lobby-invite";
  banner.hidden = true;
  const bannerText = document.createElement("p");
  bannerText.id = "lobby-invite-text";
  const acceptButton = document.createElement("button");
  acceptButton.type = "button";
  acceptButton.textContent = "Join";
  const declineButton = document.createElement("button");
  declineButton.type = "button";
  declineButton.textContent = "No";
  banner.append(bannerText, acceptButton, declineButton);

  const countdown = document.createElement("p");
  countdown.id = "start-countdown";
  countdown.hidden = true;

  const hillStart = document.createElement("button");
  hillStart.type = "button";
  hillStart.id = "hill-start";
  hillStart.textContent = "Start";
  hillStart.title = "Start the countdown now, even if a slot is still open.";
  hillStart.hidden = true;
  const hillLeave = document.createElement("button");
  hillLeave.type = "button";
  hillLeave.id = "hill-leave";
  hillLeave.textContent = "Leave";
  hillLeave.hidden = true;
  const hillBack = document.createElement("button");
  hillBack.type = "button";
  hillBack.id = "hill-lobby";
  hillBack.textContent = "Lobby";
  hillBack.hidden = true;
  const hillBar = document.createElement("div");
  hillBar.id = "hill-bar";
  hillBar.append(hillStart, hillLeave, hillBack);
  const hillWait = document.createElement("p");
  hillWait.id = "hill-wait";
  hillWait.hidden = true;

  document.body.append(shell, banner, countdown, hillWait, hillBar);

  let chatUnsub = null;
  let chatTransport = null;
  let pendingInvite = null;
  let me = "";
  let roster = [];
  let seated = [];
  let soloPrompt = true;
  let sending = false;
  fillSlots(6);

  hostButton.addEventListener("click", () => onHost?.(nameInput.value, Number(slotsSelect.value)));
  joinButton.addEventListener("click", () => onJoin?.(codeInput.value, nameInput.value));
  startButton.addEventListener("click", () => onSeal?.());
  leaveButton.addEventListener("click", () => onLeave?.());
  aloneButton.addEventListener("click", () => onAlone?.());
  soloButton.addEventListener("click", () => onAlone?.());
  hillStart.addEventListener("click", () => onSeal?.());
  hillLeave.addEventListener("click", () => onLeave?.());
  hillBack.addEventListener("click", () => onBack?.());
  acceptButton.addEventListener("click", () => onAccept?.());
  declineButton.addEventListener("click", () => {
    pendingInvite = null;
    banner.hidden = true;
    onDecline?.();
  });
  codeInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onJoin?.(codeInput.value, nameInput.value);
  });
  nameInput.addEventListener("input", () => {
    onName?.(nameInput.value);
    refreshGate();
  });
  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text || sending || !chatTransport?.send) return;
    const problem = nameProblem(false);
    if (problem) {
      setStatus(problem);
      refreshGate();
      return;
    }
    sending = true;
    chatTransport.send(text).then((saved) => {
      if (!saved) {
        const blocked = nameProblem(false);
        if (blocked) setStatus(blocked);
        refreshGate();
        return;
      }
      if (chatInput.value.trim() === text) chatInput.value = "";
      soloPrompt = false;
      soloButton.hidden = true;
    }).catch((error) => setStatus(error?.message || "Could not send.")).finally(() => {
      sending = false;
    });
  });

  function fillSlots(max) {
    const cap = Math.max(2, Math.min(6, Number(max) || 6));
    const current = Number(slotsSelect.value) || cap;
    slotsSelect.replaceChildren();
    for (let count = 2; count <= cap; count += 1) {
      const option = document.createElement("option");
      option.value = String(count);
      option.textContent = `${count} riders`;
      slotsSelect.append(option);
    }
    const next = Math.min(cap, Math.max(2, current));
    slotsSelect.value = String(next);
  }

  function setStatus(text) {
    status.textContent = text || "";
  }

  function setRoom(next) {
    if (!next?.code) {
      roomCard.hidden = true;
      soloButton.hidden = !soloPrompt;
      codeLine.textContent = "";
      names.textContent = "";
      return;
    }
    roomCard.hidden = false;
    soloButton.hidden = true;
    codeLine.textContent = next.code;
    const started = next.phase === "counting" || next.phase === "racing" || !!next.sealed;
    startButton.hidden = next.role !== "host" || started;
  }

  function setSlots(slots) {
    seated = slots || [];
    names.textContent = seated.map((row) => shownName(row.displayName)).join(", ");
    refreshGate();
  }

  function setPeople(list, actor) {
    if (actor) me = actor;
    roster = list || [];
    peopleList.replaceChildren();
    if (!roster.length) {
      const empty = document.createElement("p");
      empty.className = "lobby-empty";
      empty.textContent = "Nobody is in the lobby yet.";
      peopleList.append(empty);
      refreshGate();
      return;
    }
    for (const person of roster) {
      const row = document.createElement("div");
      row.className = "lobby-person";
      const label = document.createElement("span");
      label.textContent = shownName(person.displayName);
      const invite = document.createElement("button");
      invite.type = "button";
      invite.textContent = "Invite";
      const mine = !!person.actor && person.actor === me;
      const busy = person.status === "waiting" || person.status === "racing";
      invite.hidden = mine || busy;
      invite.disabled = busy;
      if (person.status === "racing") invite.title = "In a race";
      else if (person.status === "waiting") invite.title = "Already at a table";
      invite.addEventListener("click", () => onInvite?.(person.actor));
      row.append(label, invite);
      peopleList.append(row);
    }
    refreshGate();
  }

  function setGames(list) {
    gamesList.replaceChildren();
    const rows = list || [];
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "lobby-empty";
      empty.textContent = "No open games.";
      gamesList.append(empty);
      refreshGate();
      return;
    }
    for (const game of rows) {
      const row = document.createElement("div");
      row.className = "lobby-game";
      const heading = document.createElement("p");
      const seated = Number(game.seated) || 0;
      const wanted = Number(game.slotsWanted) || seated;
      const starting = game.phase === "counting" ? " · starting" : "";
      heading.textContent = `${game.code || ""} · ${game.hostName || "Host"} · ${seated}/${wanted}${starting}`;
      const who = document.createElement("p");
      who.textContent = (game.names || []).map((item) => shownName(item)).join(", ");
      const join = document.createElement("button");
      join.type = "button";
      join.textContent = "Join";
      join.addEventListener("click", () => {
        const problem = nameProblem(true);
        if (problem) {
          setStatus(problem);
          refreshGate();
          return;
        }
        onJoin?.(game.code, nameInput.value);
      });
      row.append(heading, who, join);
      gamesList.append(row);
    }
    refreshGate();
  }

  function renderChat(view) {
    log.replaceChildren();
    for (const message of view?.messages || []) {
      const line = document.createElement("p");
      const who = shownName(chatTransport?.nameFor?.(message.authorUserId));
      line.textContent = `${who}: ${message.body || ""}`;
      log.append(line);
    }
    log.scrollTop = log.scrollHeight;
  }

  function bindChat(transport) {
    if (chatUnsub) chatUnsub();
    chatUnsub = null;
    chatTransport = transport || null;
    if (!transport?.subscribe) {
      log.replaceChildren();
      return;
    }
    chatUnsub = transport.subscribe((view) => renderChat(view));
  }

  function showInvite(invite) {
    pendingInvite = invite || null;
    if (!invite?.code) {
      banner.hidden = true;
      return;
    }
    const who = invite.from || invite.hostName || "Someone";
    bannerText.textContent = `${who} invited you to ${invite.code}.`;
    banner.hidden = false;
  }

  function takeInvite() {
    const invite = pendingInvite;
    pendingInvite = null;
    banner.hidden = true;
    return invite;
  }

  function show() {
    shell.hidden = false;
    setHillChrome("none");
  }

  function hide() {
    shell.hidden = true;
  }

  function setHillChrome(which, note) {
    hillStart.hidden = which !== "host";
    hillLeave.hidden = which !== "leave" && which !== "host";
    hillBack.hidden = which !== "back";
    const text = typeof note === "string" ? note : "";
    hillWait.hidden = text === "";
    hillWait.textContent = text;
  }

  function setCountdown(text) {
    const showCount = text != null && text !== "";
    countdown.hidden = !showCount;
    countdown.textContent = showCount ? String(text) : "";
  }

  refreshGate();

  return {
    setStatus,
    setRoom,
    setSlots,
    setPeople,
    setGames,
    setMaxPlayers: fillSlots,
    bindChat,
    show,
    hide,
    showInvite,
    hideInvite() {
      pendingInvite = null;
      banner.hidden = true;
    },
    takeInvite,
    setHillChrome,
    setCountdown,
    name: () => nameInput.value,
    look: () => ({ ...picked }),
    slots: () => Number(slotsSelect.value) || 2,
  };

  function colorCss(hex) {
    return `#${Number(hex).toString(16).padStart(6, "0")}`;
  }

  function pickRow(caption, rows, field) {
    const wrap = document.createElement("div");
    wrap.className = "lobby-pick";
    const captionEl = document.createElement("span");
    captionEl.textContent = caption;
    const row = document.createElement("div");
    row.className = "lobby-swatches";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", caption);
    const buttons = [];
    for (const item of rows) {
      const button = document.createElement("button");
      button.type = "button";
      button.title = item.label;
      button.setAttribute("aria-label", `${caption} ${item.label}`);
      button.style.background = colorCss(swatchValue(item, field));
      const selected = field === "shirtRand"
        ? Math.abs(picked.shirtRand - item.shirtRand) < 1e-6
        : picked[field] === item[field];
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.addEventListener("click", () => {
        picked[field] = item[field];
        for (const other of buttons) other.setAttribute("aria-pressed", other === button ? "true" : "false");
      });
      buttons.push(button);
      row.append(button);
    }
    wrap.append(captionEl, row);
    return wrap;
  }

  function swatchValue(item, field) {
    if (field === "shirtRand") return item.color;
    if (field === "logoColor") return item.logoColor;
    return item.can;
  }

  function choiceRow(caption, rows, field) {
    const wrap = document.createElement("div");
    wrap.className = "lobby-pick";
    const captionEl = document.createElement("span");
    captionEl.textContent = caption;
    const row = document.createElement("div");
    row.className = "lobby-choices";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", caption);
    const buttons = [];
    for (const item of rows) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      button.setAttribute("aria-pressed", picked[field] === item.id ? "true" : "false");
      button.addEventListener("click", () => {
        picked[field] = item.id;
        for (const other of buttons) other.setAttribute("aria-pressed", other === button ? "true" : "false");
      });
      buttons.push(button);
      row.append(button);
    }
    wrap.append(captionEl, row);
    return wrap;
  }

  function shownName(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text || "Picking a name";
  }

  function nameRoster() {
    return [...roster, ...seated];
  }

  function nameProblem(join) {
    return nameBlock(nameInput.value, nameRoster(), me, { join: !!join });
  }

  function refreshGate() {
    const talk = nameProblem(false);
    const join = nameProblem(true);
    chatInput.disabled = !!talk;
    sendButton.disabled = !!talk;
    chatInput.placeholder = talk || "Say something";
    hostButton.disabled = !canHost || !!join;
    hostButton.title = !canHost
      ? "A phone can't host. Join from here, or host on a computer or headset."
      : (join || "");
    joinButton.disabled = !!join;
    joinButton.title = join || "";
    acceptButton.disabled = !!join;
    if (join) acceptButton.title = join;
    else acceptButton.removeAttribute("title");
    for (const button of gamesList.querySelectorAll("button")) {
      button.disabled = !!join;
      button.title = join || "";
    }
  }
}
