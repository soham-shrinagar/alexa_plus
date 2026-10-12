import { $, element } from "./dom.js";
let source = {
  environment: { weekday: "Monday" },
  policies: {
    maxConcurrentPowerWatts: 3000,
    rainyDepartureAdvanceMinutes: 10,
    earliestStarts: [],
  },
};
function field(row, key, label, type = "text", value = "", attributes = {}) {
  const box = element("div");
  const input = element("input");
  input.type = type;
  input.value = value;
  input.dataset.field = key;
  Object.assign(input, attributes);
  const id = `edit-${crypto.randomUUID()}`;
  input.id = id;
  const caption = element("label", label);
  caption.htmlFor = id;
  box.append(caption, input);
  row.append(box);
  return input;
}
function removeButton(row) {
  const remove = element("button", "Remove row", "remove-row");
  remove.type = "button";
  remove.addEventListener("click", () => row.remove());
  row.append(remove);
}
export function addPerson(
  person = {
    id: `person-${$("#people-editor").children.length + 1}`,
    name: "",
    roles: [],
  },
  earliest = "",
) {
  const row = element("div", null, "editor-row");
  row.dataset.kind = "person";
  const grid = element("div", null, "form-grid");
  field(grid, "name", "Name", "text", person.name, {
    required: true,
    maxLength: 80,
  });
  field(grid, "id", "ID", "text", person.id, {
    required: true,
    pattern: "[a-z][a-z0-9-]{0,63}",
  });
  field(
    grid,
    "preparationMinutes",
    "Preparation · min (optional)",
    "number",
    person.preparationMinutes ?? "",
    { min: "1", max: "240" },
  );
  field(grid, "earliest", "Earliest start (optional)", "time", earliest);
  field(
    grid,
    "roles",
    "Roles · comma separated",
    "text",
    (person.roles ?? []).join(", "),
  );
  row.append(grid);
  removeButton(row);
  $("#people-editor").append(row);
}
export function addDevice(
  device = {
    id: `device-${$("#devices-editor").children.length + 1}`,
    name: "",
    capabilities: [],
    powerWatts: 0,
    minimumDurationMinutes: 1,
  },
  earliest = "",
) {
  const row = element("div", null, "editor-row");
  row.dataset.kind = "device";
  const grid = element("div", null, "form-grid");
  field(grid, "name", "Name", "text", device.name, {
    required: true,
    maxLength: 80,
  });
  field(grid, "id", "ID", "text", device.id, {
    required: true,
    pattern: "[a-z][a-z0-9-]{0,63}",
  });
  field(
    grid,
    "capabilities",
    "Capabilities · comma separated",
    "text",
    device.capabilities.join(", "),
    { required: true },
  );
  field(grid, "powerWatts", "Power · W", "number", device.powerWatts, {
    min: "0",
    max: "20000",
    required: true,
  });
  field(
    grid,
    "minimumDurationMinutes",
    "Minimum duration · min",
    "number",
    device.minimumDurationMinutes ?? 1,
    { min: "1", max: "240", required: true },
  );
  field(grid, "location", "Room", "text", device.location ?? "home");
  field(grid, "earliest", "Earliest start (optional)", "time", earliest);
  const noisy = element("label", null, "checkbox");
  const check = element("input");
  check.type = "checkbox";
  check.checked = device.audible === true;
  check.dataset.field = "audible";
  noisy.append(check, document.createTextNode("Audible action"));
  grid.append(noisy);
  row.append(grid);
  removeButton(row);
  $("#devices-editor").append(row);
}
const clock = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const minute = (value) =>
  Number(value.split(":")[0]) * 60 + Number(value.split(":")[1]);
export function loadProfile(profile, asCopy = false) {
  source = structuredClone(profile);
  $("#household-name").value = asCopy
    ? profile.id === "personal-day"
      ? "My household"
      : `My ${profile.name}`
    : profile.name;
  $("#household-id").value = asCopy
    ? `custom-${profile.id}`.slice(0, 64)
    : profile.id;
  $("#power-budget").value = profile.policies.maxConcurrentPowerWatts;
  $("#quiet-until").value =
    profile.policies.quietUntilMinute === undefined
      ? ""
      : clock(profile.policies.quietUntilMinute);
  $("#household-rain").value = profile.policies.rainyDepartureAdvanceMinutes;
  $("#people-editor").replaceChildren();
  $("#devices-editor").replaceChildren();
  for (const person of profile.people) {
    const earliest = profile.policies.earliestStarts?.find(
      (rule) => rule.targetId === person.id,
    );
    addPerson(person, earliest ? clock(earliest.atMinute) : "");
  }
  for (const device of profile.devices) {
    const earliest = profile.policies.earliestStarts?.find(
      (rule) => rule.targetId === device.id,
    );
    addDevice(device, earliest ? clock(earliest.atMinute) : "");
  }
  $("#household-json").value = JSON.stringify(profile, null, 2);
  const summary = $("#profile-summary");
  summary.replaceChildren();
  for (const [label, value] of [
    ["People", profile.people.length],
    ["Devices", profile.devices.length],
    ["Power policy", `${profile.policies.maxConcurrentPowerWatts} W`],
    [
      "Quiet until",
      profile.policies.quietUntilMinute === undefined
        ? "Not set"
        : clock(profile.policies.quietUntilMinute),
    ],
  ]) {
    const row = element("div", null, "profile-stat");
    row.append(element("span", label), element("b", String(value)));
    summary.append(row);
  }
}
export function collectProfile() {
  for (const input of $("#view-household").querySelectorAll("input"))
    if (!input.checkValidity()) throw new Error(input.validationMessage);
  const read = (row) =>
    Object.fromEntries(
      [...row.querySelectorAll("[data-field]")].map((input) => [
        input.dataset.field,
        input.type === "checkbox" ? input.checked : input.value,
      ]),
    );
  const people = [...$("#people-editor").children].map(read);
  const devices = [...$("#devices-editor").children].map(read);
  const profile = {
    ...source,
    id: $("#household-id").value.trim(),
    name: $("#household-name").value.trim(),
    people: people.map((person) => ({
      id: person.id.trim(),
      name: person.name.trim(),
      roles: person.roles
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      ...(person.preparationMinutes
        ? { preparationMinutes: Number(person.preparationMinutes) }
        : {}),
    })),
    devices: devices.map((device) => ({
      id: device.id.trim(),
      name: device.name.trim(),
      capabilities: device.capabilities
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      powerWatts: Number(device.powerWatts),
      minimumDurationMinutes: Number(device.minimumDurationMinutes),
      location: device.location.trim() || "home",
      audible: device.audible,
    })),
    policies: {
      ...source.policies,
      maxConcurrentPowerWatts: Number($("#power-budget").value),
      rainyDepartureAdvanceMinutes: Number($("#household-rain").value),
      earliestStarts: [...people, ...devices]
        .filter((person) => person.earliest)
        .map((person) => ({
          targetId: person.id.trim(),
          atMinute: minute(person.earliest),
        })),
    },
  };
  if ($("#quiet-until").value)
    profile.policies.quietUntilMinute = minute($("#quiet-until").value);
  else delete profile.policies.quietUntilMinute;
  if (!profile.people.length) throw new Error("Declare at least one person.");
  return profile;
}
