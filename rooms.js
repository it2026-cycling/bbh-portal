(function () {
  const el = (id) => document.getElementById(id);

  const state = {
    me: null,
    properties: [],
    selectedProperty: null,
    rooms: [],
  };

  function setBadge(badgeEl, text, kind) {
    badgeEl.textContent = text;
    badgeEl.className = "pill " + (kind || "warn");
  }

  function showDebug(msg, obj) {
    const box = el("debugBox");
    const safe = obj ? ("<pre class='mono' style='white-space:pre-wrap;word-break:break-word;margin:8px 0 0'>" +
      escapeHtml(JSON.stringify(obj, null, 2)) + "</pre>") : "";
    box.innerHTML = escapeHtml(msg) + safe;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function apiGet(path) {
    const res = await fetch(path, { method: "GET", credentials: "include" });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) throw { status: res.status, data };
    return data;
  }

  async function apiSend(path, method, body) {
    const res = await fetch(path, {
      method,
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) throw { status: res.status, data };
    return data;
  }

  function renderProperties() {
    const list = el("propsList");
    list.innerHTML = "";

    el("propsCount").textContent = state.properties.length ? `${state.properties.length} trovate` : "";

    state.properties.forEach((p) => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div>
          <div style="font-weight:650">${escapeHtml(p.name || "")}</div>
          <div class="muted">Destination: ${escapeHtml(String(p.destination || ""))} · Status: ${escapeHtml(String(p.status || ""))}</div>
          <div class="muted">ID: <span class="mono">${escapeHtml(p.id)}</span></div>
        </div>
        <div>
          <button class="btn" data-action="detail" data-property-id="${escapeHtml(p.id)}">Dettaglio</button>
        </div>
      `;
      list.appendChild(div);
    });

    if (!state.properties.length) {
      el("propsHint").textContent =
        "Nessuna struttura. Se sei manager, controlla che l’utente abbia Properties assegnate in Airtable e riprova /api/properties.";
    } else {
      el("propsHint").textContent = "Clicca “Dettaglio” per gestire le camere della struttura selezionata.";
    }
  }

  function setSelectedPropertyById(propertyId) {
    const p = state.properties.find((x) => x.id === propertyId);
    if (!p) return;

    state.selectedProperty = p;
    el("noSelection").classList.add("hidden");
    el("detail").classList.remove("hidden");

    el("selectedPropName").textContent = p.name || "-";
    el("selectedPropId").textContent = p.id;
    el("selectedPropMeta").textContent = `Selezionata: ${p.name || p.id}`;

    // Reset rooms UI
    el("roomsHint").textContent = "Clicca “Carica camere”.";
    el("roomsTable").classList.add("hidden");
    el("roomsTbody").innerHTML = "";
    el("createMsg").textContent = "";
    showDebug("Pronto. Ora puoi caricare le camere.", { selected_property: p });
  }

  function renderRooms() {
    const tbody = el("roomsTbody");
    tbody.innerHTML = "";

    state.rooms.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input data-room-id="${escapeHtml(r.id)}" data-field="name" value="${escapeHtml(r.name || "")}"></td>
        <td><input type="number" data-room-id="${escapeHtml(r.id)}" data-field="capacity" value="${escapeHtml(String(r.capacity ?? ""))}"></td>
        <td><input type="number" data-room-id="${escapeHtml(r.id)}" data-field="quantity" value="${escapeHtml(String(r.quantity ?? ""))}"></td>
        <td>
          <select data-room-id="${escapeHtml(r.id)}" data-field="status">
            <option value="active" ${String(r.status||"").toLowerCase()==="active" ? "selected" : ""}>active</option>
            <option value="inactive" ${String(r.status||"").toLowerCase()==="inactive" ? "selected" : ""}>inactive</option>
          </select>
        </td>
        <td>
          <button class="btn primary" data-action="save-room" data-room-id="${escapeHtml(r.id)}">Salva</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    el("roomsHint").textContent = state.rooms.length ? "" : "Nessuna camera trovata per questa struttura.";
    el("roomsTable").classList.toggle("hidden", !state.rooms.length);
  }

  async function loadMeAndProperties() {
    setBadge(el("jsBadge"), "JS: caricato", "ok");
    setBadge(el("authBadge"), "Auth: controllo…", "warn");

    try {
      const me = await apiGet("/api/me");
      state.me = me;
      setBadge(el("authBadge"), "Auth: OK", "ok");
      el("roleBadge").textContent = `Ruolo: ${me.role || "-"}`;
      showDebug("Utente autenticato.", me);
    } catch (e) {
      setBadge(el("authBadge"), "Auth: KO", "warn");
      showDebug("Errore su /api/me (forse non sei loggato via Access).", e);
      return;
    }

    try {
      const props = await apiGet("/api/properties");
      state.properties = props.items || [];
      renderProperties();
      showDebug("Proprietà caricate da /api/properties.", props);
    } catch (e) {
      showDebug("Errore su /api/properties.", e);
    }
  }

  async function loadRoomsForSelected() {
    if (!state.selectedProperty) return;
    el("loadRoomsBtn").disabled = true;
    try {
      const pid = state.selectedProperty.id;
      const data = await apiGet(`/api/rooms?property_id=${encodeURIComponent(pid)}`);
      state.rooms = data.items || [];
      renderRooms();
      showDebug("Camere caricate.", data);
    } catch (e) {
      showDebug("Errore nel caricamento camere (/api/rooms).", e);
    } finally {
      el("loadRoomsBtn").disabled = false;
    }
  }

  async function createRoom() {
    if (!state.selectedProperty) return;

    const name = el("newName").value.trim();
    const capacity = el("newCapacity").value;
    const quantity = el("newQuantity").value;
    const status = el("newStatus").value;

    if (!name) {
      el("createMsg").textContent = "Inserisci un nome.";
      return;
    }

    el("createRoomBtn").disabled = true;
    el("createMsg").textContent = "Creazione…";

    try {
      const payload = {
        property_id: state.selectedProperty.id,
        name,
        capacity: capacity === "" ? null : Number(capacity),
        quantity: quantity === "" ? null : Number(quantity),
        status,
      };
      const data = await apiSend("/api/rooms", "POST", payload);
      el("createMsg").textContent = "Creato.";
      el("newName").value = "";
      el("newCapacity").value = "";
      el("newQuantity").value = "";
      el("newStatus").value = "active";
      // reload rooms
      await loadRoomsForSelected();
      showDebug("Room creata.", data);
    } catch (e) {
      el("createMsg").textContent = "Errore in creazione. Vedi debug sotto.";
      showDebug("Errore su POST /api/rooms.", e);
    } finally {
      el("createRoomBtn").disabled = false;
    }
  }

  function getCurrentRoomValue(roomId, field) {
    const selector = `[data-room-id="${CSS.escape(roomId)}"][data-field="${CSS.escape(field)}"]`;
    const node = document.querySelector(selector);
    if (!node) return undefined;
    if (node.tagName === "SELECT") return node.value;
    return node.value;
  }

  async function saveRoom(roomId) {
    const name = (getCurrentRoomValue(roomId, "name") || "").trim();
    const capRaw = getCurrentRoomValue(roomId, "capacity");
    const qtyRaw = getCurrentRoomValue(roomId, "quantity");
    const status = (getCurrentRoomValue(roomId, "status") || "").trim();

    const payload = {
      name,
      capacity: capRaw === "" ? null : Number(capRaw),
      quantity: qtyRaw === "" ? null : Number(qtyRaw),
      status,
    };

    try {
      const data = await apiSend(`/api/rooms/${encodeURIComponent(roomId)}`, "PUT", payload);
      showDebug("Room aggiornata.", data);
      await loadRoomsForSelected();
    } catch (e) {
      showDebug("Errore su PUT /api/rooms/:id.", e);
    }
  }

  function wireEvents() {
    // List click (event delegation)
    el("propsList").addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      if (action !== "detail") return;
      const pid = btn.getAttribute("data-property-id");
      setSelectedPropertyById(pid);
    });

    el("reloadBtn").addEventListener("click", () => loadMeAndProperties());
    el("loadRoomsBtn").addEventListener("click", () => loadRoomsForSelected());
    el("createRoomBtn").addEventListener("click", () => createRoom());

    // Save room buttons
    document.addEventListener("click", (ev) => {
      const btn = ev.target.closest('[data-action="save-room"]');
      if (!btn) return;
      const roomId = btn.getAttribute("data-room-id");
      if (!roomId) return;
      saveRoom(roomId);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireEvents();
    loadMeAndProperties();
  });
})();