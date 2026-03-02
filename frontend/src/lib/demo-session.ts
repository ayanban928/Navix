import type { AgentResponse, ExpenseItem, Trip } from "@/lib/types";

export const DEMO_EMAIL = "example123@gmail.com";
export const DEMO_USERNAME = "example123";
export const DEMO_PASSWORD = "123meow!";
export const DEMO_TOKEN = "demo_token_example123";

export const demoTrip: Trip = {
  id: "trip_demo_rome",
  destination: "Rome, Italy",
  departureCity: "Boston",
  startDate: "2026-05-18",
  endDate: "2026-05-23",
  budget: 3500,
  groupSize: 2,
  preferences: {
    travelStyle: "balanced",
    interests: ["food", "history", "local neighborhoods"],
    hardConstraints: ["No activities before 9:00 AM"]
  },
  days: [
    {
      date: "2026-05-18",
      theme: "Arrival + Centro Storico",
      activities: [
        {
          id: "demo_act_1",
          name: "Hotel check-in near Pantheon",
          category: "hotel",
          startTime: "14:00",
          endTime: "15:00",
          location: "Pantheon District",
          cost: 520,
          costStatus: "estimated",
          source: "agent"
        },
        {
          id: "demo_act_2",
          name: "Piazza Navona evening walk",
          category: "sightseeing",
          startTime: "18:00",
          endTime: "19:30",
          location: "Piazza Navona",
          cost: 0,
          costStatus: "estimated",
          source: "agent"
        }
      ]
    },
    {
      date: "2026-05-19",
      theme: "Ancient Rome",
      activities: [
        {
          id: "demo_act_3",
          name: "Colosseum and Roman Forum guided visit",
          category: "sightseeing",
          startTime: "10:00",
          endTime: "13:00",
          location: "Colosseum",
          cost: 180,
          costStatus: "estimated",
          source: "api"
        }
      ]
    }
  ],
  projectedCost: 2480,
  confirmedCost: 0,
  expenses: [
    {
      id: "demo_exp_1",
      label: "Flight BOS -> FCO roundtrip",
      category: "flight",
      amount: 940,
      status: "estimated"
    },
    {
      id: "demo_exp_2",
      label: "Hotel (5 nights)",
      category: "hotel",
      amount: 520,
      status: "estimated"
    }
  ],
  bookings: [
    {
      id: "demo_booking_1",
      type: "flight",
      vendor: "Delta",
      itemName: "BOS -> FCO roundtrip",
      status: "pending_confirmation"
    },
    {
      id: "demo_booking_2",
      type: "activity",
      vendor: "GetYourGuide",
      itemName: "Colosseum guided visit",
      status: "suggested"
    }
  ],
  status: "planning"
};

function cloneTrip(trip: Trip): Trip {
  return JSON.parse(JSON.stringify(trip)) as Trip;
}

function recalculateConfirmedCost(trip: Trip): void {
  trip.confirmedCost = trip.expenses
    .filter((expense: ExpenseItem) => expense.status === "confirmed")
    .reduce((sum, expense) => sum + expense.amount, 0);
}

export function runDemoAgent(message: string, currentTrip: Trip): AgentResponse {
  const lower = message.toLowerCase();
  const updatedTrip = cloneTrip(currentTrip);
  const changes: string[] = [];

  if (lower.includes("confirm") && lower.includes("flight")) {
    const flightBooking = updatedTrip.bookings.find((booking) => booking.type === "flight");
    const flightExpense = updatedTrip.expenses.find((expense) => expense.category === "flight");

    if (flightBooking) {
      flightBooking.status = "confirmed";
      flightBooking.evidenceUrl = "https://demo.navix.local/booking/FLIGHT-123";
      changes.push("Confirmed flight booking with evidence reference.");
    }

    if (flightExpense) {
      flightExpense.status = "confirmed";
      changes.push("Marked flight expense as confirmed.");
    }

    recalculateConfirmedCost(updatedTrip);
  }

  if (lower.includes("add") && lower.includes("food")) {
    updatedTrip.days[0]?.activities.push({
      id: `demo_act_${Date.now()}`,
      name: "Trastevere dinner reservation",
      category: "food",
      startTime: "20:00",
      endTime: "22:00",
      location: "Trastevere",
      cost: 95,
      costStatus: "estimated",
      source: "agent"
    });
    updatedTrip.expenses.push({
      id: `demo_exp_${Date.now()}`,
      label: "Trastevere dinner",
      category: "food",
      amount: 95,
      status: "estimated"
    });
    updatedTrip.projectedCost += 95;
    changes.push("Added food activity to Day 1 itinerary.");
    changes.push("Updated projected cost with estimated dinner spend.");
  }

  if (changes.length === 0) {
    changes.push("No schema changes applied.");
  }

  return {
    assistantMessage:
      "Demo session active. I applied deterministic local state updates so you can preview the dashboard interactions.",
    updatedTrip,
    stateChanges: changes
  };
}
