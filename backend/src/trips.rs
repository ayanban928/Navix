use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use sqlx::{types::Json as SqlxJson, Row};
use uuid::Uuid;

use crate::{middleware::AuthUser, models::Trip, AppError, AppState};

pub async fn list_trips(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<Vec<Trip>>, AppError> {
    let rows = sqlx::query("SELECT data FROM trips WHERE user_id = $1 ORDER BY updated_at DESC")
        .bind(auth.user_id)
        .fetch_all(&state.db)
        .await?;

    let mut trips = Vec::with_capacity(rows.len());
    for row in rows {
        let SqlxJson(trip) = row.try_get::<SqlxJson<Trip>, _>("data")?;
        trips.push(trip);
    }

    Ok(Json(trips))
}

pub async fn get_trip(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(trip_id): Path<String>,
) -> Result<Json<Trip>, AppError> {
    let trip_uuid = Uuid::parse_str(&trip_id)
        .map_err(|_| AppError::BadRequest("Invalid trip ID".to_string()))?;

    let row = sqlx::query("SELECT user_id, data FROM trips WHERE id = $1")
        .bind(trip_uuid)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Trip not found".to_string()))?;

    let owner_id: Uuid = row.try_get("user_id")?;
    if owner_id != auth.user_id {
        // Return 404 instead of 403 to avoid leaking trip existence
        return Err(AppError::NotFound("Trip not found".to_string()));
    }

    let SqlxJson(trip) = row.try_get::<SqlxJson<Trip>, _>("data")?;

    Ok(Json(trip))
}

pub async fn create_trip(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(mut trip): Json<Trip>,
) -> Result<Json<Trip>, AppError> {
    let trip_id = Uuid::new_v4();
    trip.id = trip_id.to_string();

    sqlx::query("INSERT INTO trips (id, user_id, data) VALUES ($1, $2, $3)")
        .bind(trip_id)
        .bind(auth.user_id)
        .bind(SqlxJson(&trip))
        .execute(&state.db)
        .await?;

    Ok(Json(trip))
}

pub async fn delete_trip(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(trip_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let trip_uuid = Uuid::parse_str(&trip_id)
        .map_err(|_| AppError::BadRequest("Invalid trip ID".to_string()))?;

    let result = sqlx::query("DELETE FROM trips WHERE id = $1 AND user_id = $2")
        .bind(trip_uuid)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Trip not found".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}
