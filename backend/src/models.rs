use serde::{Deserialize, Serialize};

// ---- Auth ----

#[derive(Debug, Deserialize)]
pub struct SignupRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    /// Accepts email or username.
    pub identifier: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub access_token: String,
    pub user: UserInfo,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub email: String,
}

// ---- JWT ----

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // user_id
    pub exp: usize,
}

// ---- Trip (mirrors frontend src/lib/types.ts) ----

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub travel_style: String,
    pub interests: Vec<String>,
    pub hard_constraints: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: String,
    pub name: String,
    pub category: String,
    pub start_time: String,
    pub end_time: String,
    pub location: String,
    pub cost: f64,
    pub cost_status: String,
    pub source: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DayPlan {
    pub date: String,
    pub theme: String,
    pub activities: Vec<Activity>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseItem {
    pub id: String,
    pub label: String,
    pub category: String,
    pub amount: f64,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Booking {
    pub id: String,
    #[serde(rename = "type")]
    pub booking_type: String,
    pub vendor: String,
    pub item_name: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evidence_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Trip {
    pub id: String,
    pub destination: String,
    pub departure_city: String,
    pub start_date: String,
    pub end_date: String,
    pub budget: f64,
    pub group_size: u32,
    pub preferences: Preferences,
    pub days: Vec<DayPlan>,
    pub projected_cost: f64,
    pub confirmed_cost: f64,
    pub expenses: Vec<ExpenseItem>,
    pub bookings: Vec<Booking>,
    pub status: String,
}

// ---- Chat ----

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResponse {
    pub assistant_message: String,
    pub updated_trip: Trip,
    pub state_changes: Vec<String>,
}
