use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use sqlx::{types::Json as SqlxJson, Row};
use uuid::Uuid;

use crate::{middleware::AuthUser, models::{AgentResponse, ChatRequest}, AppError, AppState};

// Minimal structs for deserializing the OpenAI chat completions response.
#[derive(Deserialize)]
struct OpenAiResponse {
    choices: Vec<OpenAiChoice>,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    message: OpenAiMessage,
}

#[derive(Deserialize)]
struct OpenAiMessage {
    content: String,
}

pub async fn chat(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(trip_id): Path<String>,
    Json(payload): Json<ChatRequest>,
) -> Result<Json<AgentResponse>, AppError> {
    let trip_uuid = Uuid::parse_str(&trip_id)
        .map_err(|_| AppError::BadRequest("Invalid trip ID".to_string()))?;

    // Load trip and verify ownership.
    let row = sqlx::query("SELECT user_id, data FROM trips WHERE id = $1")
        .bind(trip_uuid)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Trip not found".to_string()))?;

    let owner_id: Uuid = row.try_get("user_id")?;
    if owner_id != auth.user_id {
        return Err(AppError::NotFound("Trip not found".to_string()));
    }

    let SqlxJson(trip) = row.try_get::<SqlxJson<crate::models::Trip>, _>("data")?;

    let trip_json = serde_json::to_string_pretty(&trip)
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    let system_prompt = format!(
        "You are Navix, an AI travel planning agent. You manage a structured Trip object and \
update it based on user requests.\n\n\
Current trip state (JSON):\n{trip_json}\n\n\
Respond ONLY with a valid JSON object containing exactly these three fields:\n\
- \"assistantMessage\" (string): a helpful, concise response to the user\n\
- \"updatedTrip\" (object): the complete updated Trip object with the same schema as above\n\
- \"stateChanges\" (array of strings): brief descriptions of what changed, \
  e.g. [\"Added Colosseum visit on May 19\", \"Updated hotel cost to confirmed\"]\n\n\
Rules:\n\
- Keep the trip \"id\" field unchanged.\n\
- All cost values must have costStatus as \"estimated\" or \"confirmed\".\n\
- Only change what the user asks about. Preserve everything else exactly.\n\
- If the user asks something invalid or impossible, politely decline in assistantMessage \
  and return the trip unchanged with an empty stateChanges array."
    );

    let request_body = serde_json::json!({
        "model": "gpt-4o",
        "response_format": { "type": "json_object" },
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user",   "content": payload.message }
        ]
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(&state.openai_api_key)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("OpenAI request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Internal(anyhow::anyhow!(
            "OpenAI API error {status}: {body}"
        )));
    }

    let openai_resp: OpenAiResponse = response
        .json()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to parse OpenAI response: {e}")))?;

    let content = openai_resp
        .choices
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("OpenAI returned no choices")))?
        .message
        .content;

    let agent_response: AgentResponse = serde_json::from_str(&content)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to parse agent response JSON: {e}\nRaw: {content}")))?;

    // Persist the updated trip.
    sqlx::query("UPDATE trips SET data = $1, updated_at = NOW() WHERE id = $2")
        .bind(SqlxJson(&agent_response.updated_trip))
        .bind(trip_uuid)
        .execute(&state.db)
        .await?;

    Ok(Json(agent_response))
}
