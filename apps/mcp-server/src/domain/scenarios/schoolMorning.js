export const schoolMorningScenario = Object.freeze({
  id: "school-morning",
  name: "Rainy school morning",
  description: "A polished demo fixture for Rehearse's generic household routine engine.",
  household: {
    people: [
      { id: "parent", name: "Parent", roles: ["coordinator", "driver"] },
      { id: "maya", name: "Maya", roles: ["school-child"], preparationMinutes: 35 },
      { id: "baby", name: "Baby", roles: ["sleeping-child"] },
      { id: "guest", name: "Guest", roles: ["guest"] }
    ],
    devices: [
      { id: "water-heater", name: "Water heater", capabilities: ["heat_water"], powerWatts: 2000, location: "bathroom" },
      { id: "kettle", name: "Kettle", capabilities: ["boil_water"], powerWatts: 1500, location: "kitchen" },
      { id: "coffee-machine", name: "Coffee machine", capabilities: ["make_coffee"], powerWatts: 900, location: "kitchen" },
      { id: "hall-speaker", name: "Hall speaker", capabilities: ["announce"], powerWatts: 8, location: "hall" },
      { id: "entry-light", name: "Entry light", capabilities: ["set_light"], powerWatts: 10, location: "entry" },
      { id: "garden-sprinkler", name: "Garden sprinkler", capabilities: ["water_garden"], powerWatts: 120, location: "garden" },
      { id: "bedroom-fan", name: "Bedroom fan", capabilities: ["set_fan"], powerWatts: 50, location: "bedroom" }
    ]
  },
  environment: { weather: { raining: true }, travelDelayMinutes: 0, unavailableCapabilities: [] },
  defaults: {
    departureTime: "07:45",
    quietUntil: "07:00",
    rainyDepartureAdvanceMinutes: 15,
    maxConcurrentPowerWatts: 2600
  }
});

export function getScenario(id = "school-morning") {
  if (id !== schoolMorningScenario.id) return undefined;
  return structuredClone(schoolMorningScenario);
}
