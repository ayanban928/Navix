use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{extract::State, Json};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    models::{AuthResponse, Claims, LoginRequest, SignupRequest, UserInfo},
    AppError, AppState,
};

pub async fn signup(
    State(state): State<AppState>,
    Json(payload): Json<SignupRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(payload.password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Password hashing failed: {e}")))?
        .to_string();

    let user_id = Uuid::new_v4();

    sqlx::query("INSERT INTO users (id, username, email, password_hash) VALUES ($1, $2, $3, $4)")
        .bind(user_id)
        .bind(&payload.username)
        .bind(&payload.email)
        .bind(&password_hash)
        .execute(&state.db)
        .await
        .map_err(|e| {
            if e.to_string().to_lowercase().contains("unique") {
                AppError::BadRequest("Username or email already taken".to_string())
            } else {
                AppError::from(e)
            }
        })?;

    let token = create_jwt(user_id, &state.jwt_secret)?;

    Ok(Json(AuthResponse {
        access_token: token,
        user: UserInfo {
            id: user_id.to_string(),
            username: payload.username,
            email: payload.email,
        },
    }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let row = sqlx::query(
        "SELECT id, username, email, password_hash FROM users WHERE email = $1 OR username = $1",
    )
    .bind(&payload.identifier)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("Invalid credentials".to_string()))?;

    let stored_hash: String = row.try_get("password_hash")?;
    let parsed_hash = PasswordHash::new(&stored_hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to parse hash: {e}")))?;

    Argon2::default()
        .verify_password(payload.password.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::Unauthorized("Invalid credentials".to_string()))?;

    let user_id: Uuid   = row.try_get("id")?;
    let username: String = row.try_get("username")?;
    let email: String    = row.try_get("email")?;

    let token = create_jwt(user_id, &state.jwt_secret)?;

    Ok(Json(AuthResponse {
        access_token: token,
        user: UserInfo {
            id: user_id.to_string(),
            username,
            email,
        },
    }))
}

fn create_jwt(user_id: Uuid, secret: &str) -> Result<String, AppError> {
    let exp = Utc::now()
        .checked_add_signed(Duration::days(30))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims { sub: user_id.to_string(), exp };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("JWT encoding failed: {e}")))
}
